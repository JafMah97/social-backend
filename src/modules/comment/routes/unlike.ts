import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { unlikeCommentSchema } from '../commentSchemas'
import { commentErrorHandler } from '../commentErrorHandler'
import type { Prisma } from '@prisma/client'

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
}

type UnlikeCommentInput = z.infer<typeof unlikeCommentSchema>

const unlikeCommentRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/unlike',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        throw fastify.httpErrors.unauthorized('Authentication required')
      }

      const authenticatedRequest = request as AuthenticatedRequest
      const context = {
        action: 'unlike_comment',
        userId: authenticatedRequest.user.id,
      }

      try {
        const result = unlikeCommentSchema.safeParse(request.body)
        if (!result.success) throw result.error

        const { commentId }: UnlikeCommentInput = result.data

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

        // Check if liked
        const existingLike = await fastify.prisma.commentLike.findUnique({
          where: {
            userId_commentId: {
              userId: authenticatedRequest.user.id,
              commentId,
            },
          },
        })

        if (!existingLike || existingLike.isRemoved) {
          throw fastify.httpErrors.conflict('Comment not liked')
        }

        await fastify.prisma.$transaction(async (tx) => {
          // Soft delete the like
          await tx.commentLike.update({
            where: {
              userId_commentId: {
                userId: authenticatedRequest.user.id,
                commentId,
              },
            },
            data: {
              isRemoved: true,
              removedAt: new Date(),
            },
          })

          // Log activity
          await tx.userActivityLog.create({
            data: {
              userId: authenticatedRequest.user.id,
              action: 'COMMENT_UNLIKE',
              metadata: {
                commentId,
                postId: comment.postId,
              } as Prisma.InputJsonValue,
              ipAddress: authenticatedRequest.ip,
              userAgent: authenticatedRequest.headers['user-agent'] ?? null,
            },
          })
        })

        fastify.log.info(`[Comment] Unliked comment: ${commentId}`)

        return reply.status(200).send({
          success: true,
          message: 'Comment unliked successfully',
        })
      } catch (err) {
        return commentErrorHandler(authenticatedRequest, reply, err, context)
      }
    },
  )
}

export default unlikeCommentRoute
