import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { likeCommentSchema } from '../commentSchemas.js'
import { commentErrorHandler } from '../commentErrorHandler.js'
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
          where: {
            id: commentId,
            isDeleted: false,
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
            // Update existing like (un-remove it)
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
            // Create new like
            await tx.commentLike.create({
              data: {
                userId: authenticatedRequest.user.id,
                commentId,
              },
            })
          }

          // Log activity
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

        return reply.status(200).send({
          success: true,
          message: 'Comment liked successfully',
        })
      } catch (err) {
        return commentErrorHandler(authenticatedRequest, reply, err, context)
      }
    },
  )
}

export default likeCommentRoute
