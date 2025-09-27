import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { savePostSchema } from '../postSchemas'
import { postErrorHandler } from '../postErrorHandler'
import type { Prisma } from '@prisma/client'

type SavePostInput = z.infer<typeof savePostSchema>

interface RequestParams {
  postId: string
}

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
  params: RequestParams
}

const MAX_STR_LEN = 255

const truncate = (s: string | undefined | null) =>
  s == null ? '' : s.slice(0, MAX_STR_LEN)

const savePostRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/save/:postId',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authenticatedRequest = request as AuthenticatedRequest
      const { postId: rawPostId } = authenticatedRequest.params

      try {
        const result = savePostSchema.safeParse({ postId: rawPostId })
        if (!result.success) throw result.error
        const { postId }: SavePostInput = result.data

        const post = await fastify.prisma.post.findUnique({
          where: { id: postId },
          include: {
            author: {
              select: { username: true, fullName: true, profileImage: true },
            },
          },
        })

        if (!post || post.isDeleted) {
          throw {
            statusCode: 404,
            code: 'postNotFound',
            message: 'Post not found.',
          }
        }

        const userId = authenticatedRequest.user.id
        const postTitle = truncate(post.title ?? '')
        const postImage = truncate(post.image ?? '')
        const postAuthor = truncate(
          post.author?.fullName ?? post.author?.username ?? '',
        )

        // Transaction: check existing -> create or reactivate -> log
        const txResult = await fastify.prisma.$transaction(async (tx) => {
          const existing = await tx.savedPost.findFirst({
            where: { postId, userId },
            select: { id: true, isRemoved: true },
          })

          if (existing && !existing.isRemoved) {
            // already active
            throw {
              statusCode: 409,
              code: 'alreadySaved',
              message: 'You have already saved this post.',
            }
          }

          let saved
          if (existing && existing.isRemoved) {
            // reactivate soft-removed save
            saved = await tx.savedPost.update({
              where: { id: existing.id },
              data: {
                isRemoved: false,
                removedAt: null,
                postTitle,
                postImage,
                postAuthor,
              },
              include: {
                post: {
                  include: {
                    author: {
                      select: {
                        id: true,
                        username: true,
                        fullName: true,
                        profileImage: true,
                      },
                    },
                  },
                },
              },
            })
          } else {
            // create new savedPost
            saved = await tx.savedPost.create({
              data: {
                postId,
                userId,
                postTitle,
                postImage,
                postAuthor,
              },
              include: {
                post: {
                  include: {
                    author: {
                      select: {
                        id: true,
                        username: true,
                        fullName: true,
                        profileImage: true,
                      },
                    },
                  },
                },
              },
            })
          }

          await tx.userActivityLog.create({
            data: {
              userId,
              action: 'POST_SAVE',
              metadata: { postId } as Prisma.InputJsonValue,
              ipAddress: authenticatedRequest.ip,
              userAgent: authenticatedRequest.headers['user-agent'] ?? null,
            },
          })

          return saved
        })

        fastify.log.info(`[Post] User ${userId} saved post: ${postId}`)

        const status = txResult ? 201 : 200
        return reply.status(status).send({
          success: true,
          message: 'Post saved successfully.',
          data: { savedPost: txResult },
        })
      } catch (err) {
        return postErrorHandler(authenticatedRequest, reply, err, {
          action: 'save_post',
          postId: rawPostId,
          userId: authenticatedRequest.user.id,
        })
      }
    },
  )
}

export default savePostRoute
