import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { likeCommentSchema } from '../commentSchemas'
import { commentErrorHandler } from '../commentErrorHandler'
import type { Prisma } from '@prisma/client'

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
}

type LikeCommentInput = z.infer<typeof likeCommentSchema>

const likeCommentRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/like',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        throw fastify.httpErrors.unauthorized('Authentication required')
      }

      const authenticatedRequest = request as AuthenticatedRequest
      const context = {
        action: 'like_comment',
        userId: authenticatedRequest.user.id,
      }

      try {
        const result = likeCommentSchema.safeParse(request.body)
        if (!result.success) throw result.error

        const { commentId }: LikeCommentInput = result.data

        // Check if comment exists
        const comment = await fastify.prisma.comment.findFirst({
          where: { id: commentId, isDeleted: false },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                profileImage: true,
                fullName: true,
              },
            },
            commentLikes: {
              where: { isRemoved: false },
              select: { userId: true },
            },
            _count: {
              select: {
                commentLikes: { where: { isRemoved: false } },
              },
            },
          },
        })

        if (!comment) {
          throw fastify.httpErrors.notFound('Comment not found')
        }

        // Check if already liked
        const existingLike = await fastify.prisma.commentLike.findUnique({
          where: {
            userId_commentId: {
              userId: authenticatedRequest.user.id,
              commentId,
            },
          },
        })

        if (existingLike && !existingLike.isRemoved) {
          throw fastify.httpErrors.conflict('Comment already liked')
        }

        await fastify.prisma.$transaction(async (tx) => {
          if (existingLike) {
            await tx.commentLike.update({
              where: {
                userId_commentId: {
                  userId: authenticatedRequest.user.id,
                  commentId,
                },
              },
              data: {
                isRemoved: false,
                removedAt: null,
                likedAt: new Date(),
              },
            })
          } else {
            await tx.commentLike.create({
              data: {
                userId: authenticatedRequest.user.id,
                commentId,
              },
            })
          }

          await tx.userActivityLog.create({
            data: {
              userId: authenticatedRequest.user.id,
              action: 'COMMENT_LIKE',
              metadata: {
                commentId,
                postId: comment.postId,
              } as Prisma.InputJsonValue,
              ipAddress: authenticatedRequest.ip,
              userAgent: authenticatedRequest.headers['user-agent'] ?? null,
            },
          })
        })

        fastify.log.info(`[Comment] Liked comment: ${commentId}`)

        // ✅ Normalized response, same shape as create/edit/list
        return reply.status(200).send({
          success: true,
          data: {
            comment: {
              id: comment.id,
              postId: comment.postId,
              content: comment.content,
              createdAt: comment.createdAt,
              updatedAt: comment.updatedAt,
              likesCount: comment._count.commentLikes + 1, // incremented
              isLiked: true,
              author: {
                id: comment.author.id,
                username: comment.author.username,
                profileImage: comment.author.profileImage,
                fullName: comment.author.fullName,
              },
            },
          },
        })
      } catch (err) {
        return commentErrorHandler(authenticatedRequest, reply, err, context)
      }
    },
  )
}

export default likeCommentRoute
