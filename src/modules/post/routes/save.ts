/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { savePostSchema } from '../postSchemas'
import { postErrorHandler } from '../postErrorHandler'
import type { Prisma } from '@prisma/client'
import { toPostDTO, type PostDTO } from '../dto/postDTO'

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
              select: {
                id: true,
                username: true,
                fullName: true,
                profileImage: true,
                isPrivate: true,
              },
            },
            tags: { include: { tag: true } },
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

        // STEP 1 — Check existing outside transaction
        const existing = await fastify.prisma.savedPost.findFirst({
          where: { postId, userId },
          select: { id: true, isRemoved: true },
        })

        if (existing && !existing.isRemoved) {
          throw {
            statusCode: 409,
            code: 'alreadySaved',
            message: 'You have already saved this post.',
          }
        }

        // STEP 2 — Build batch queries
        const queries: any[] = []

        if (existing && existing.isRemoved) {
          queries.push(
            fastify.prisma.savedPost.update({
              where: { id: existing.id },
              data: {
                isRemoved: false,
                removedAt: null,
                postTitle,
                postImage,
                postAuthor,
              },
            }),
          )
        } else {
          queries.push(
            fastify.prisma.savedPost.create({
              data: {
                postId,
                userId,
                postTitle,
                postImage,
                postAuthor,
              },
            }),
          )
        }

        queries.push(
          fastify.prisma.userActivityLog.create({
            data: {
              userId,
              action: 'POST_SAVE',
              metadata: { postId } as Prisma.InputJsonValue,
              ipAddress: authenticatedRequest.ip,
              userAgent: authenticatedRequest.headers['user-agent'] ?? null,
            },
          }),
        )

        // STEP 3 — Execute batch transaction
        await fastify.prisma.$transaction(queries)

        fastify.log.info(`[Post] User ${userId} saved post: ${postId}`)

        const [likesCount, commentsCount] = await fastify.prisma.$transaction([
          fastify.prisma.postLike.count({
            where: { postId: post.id, isRemoved: false },
          }),
          fastify.prisma.comment.count({
            where: { postId: post.id, isDeleted: false },
          }),
        ])

        const isLiked = !!(await fastify.prisma.postLike.findFirst({
          where: { postId: post.id, userId, isRemoved: false },
        }))

        const dto: PostDTO = toPostDTO(post, {
          isLiked,
          isSaved: true,
          tags: post.tags.map((t) => t.tag.name),
        })
        dto.likesCount = likesCount
        dto.commentsCount = commentsCount
        dto.viewsCount = post.viewsCount

        return reply.status(201).send({
          success: true,
          message: 'Post saved successfully.',
          data: { post: dto },
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
