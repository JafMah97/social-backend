// src/routes/posts/unsavePost.ts
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

const unsavePostRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/unsave/:postId',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const { postId: rawPostId } = req.params

      try {
        const result = savePostSchema.safeParse({ postId: rawPostId })
        if (!result.success) throw result.error
        const { postId }: SavePostInput = result.data
        const userId = req.user.id

        await fastify.prisma.$transaction(async (tx) => {
          const post = await tx.post.findFirst({
            where: { id: postId, isDeleted: false },
          })

          if (!post) {
            throw {
              statusCode: 404,
              code: 'postNotFound',
              message: 'Post not found.',
            }
          }

          const existingSave = await tx.savedPost.findFirst({
            where: { postId, userId, isRemoved: false },
            select: { id: true },
          })

          if (!existingSave) {
            throw {
              statusCode: 409,
              code: 'notSaved',
              message: 'You have not saved this post.',
            }
          }

          await tx.savedPost.update({
            where: { id: existingSave.id },
            data: { isRemoved: true, removedAt: new Date() },
          })

          await tx.userActivityLog.create({
            data: {
              userId,
              action: 'POST_UNSAVE',
              metadata: {
                postId,
                savedPostId: existingSave.id,
              } as Prisma.InputJsonValue,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'] ?? null,
            },
          })
        })

        fastify.log.info(`[Post] User ${req.user.id} unsaved post: ${postId}`)

        // Re-fetch post with author/tags for DTO mapping
        const post = await fastify.prisma.post.findFirst({
          where: { id: postId, isDeleted: false },
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

        if (!post) {
          throw {
            statusCode: 404,
            code: 'postNotFound',
            message: 'Post not found after unsave.',
          }
        }

        const [likesCount, commentsCount] = await fastify.prisma.$transaction([
          fastify.prisma.like.count({
            where: { postId: post.id, isRemoved: false },
          }),
          fastify.prisma.comment.count({
            where: { postId: post.id, isDeleted: false },
          }),
        ])

        const isLiked = !!(await fastify.prisma.postLike.findFirst({
          where: { postId: post.id, userId, isRemoved: false },
        }))

        const isSaved = false // just unsaved

        const dto: PostDTO = toPostDTO(post, {
          isLiked,
          isSaved,
          tags: post.tags.map((t) => t.tag.name),
        })
        dto.likesCount = likesCount
        dto.commentsCount = commentsCount
        dto.viewsCount = post.viewsCount

        return reply.send({
          success: true,
          message: 'Post unsaved successfully.',
          data: { post: dto },
        })
      } catch (err) {
        return postErrorHandler(req, reply, err, {
          action: 'unsave_post',
          postId: rawPostId,
          userId: req.user.id,
        })
      }
    },
  )
}

export default unsavePostRoute
