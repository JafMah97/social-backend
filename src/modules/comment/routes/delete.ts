import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { deleteCommentSchema } from '../commentSchemas.js'
import { commentErrorHandler } from '../commentErrorHandler.js'
import type { Prisma } from '@prisma/client'

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
}

type DeleteCommentInput = z.infer<typeof deleteCommentSchema>

const deleteCommentRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete(
    '/delete',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        throw fastify.httpErrors.unauthorized('Authentication required')
      }

      const authenticatedRequest = request as AuthenticatedRequest
      const context = {
        action: 'delete_comment',
        userId: authenticatedRequest.user.id,
      }

      try {
        const result = deleteCommentSchema.safeParse(request.body)
        if (!result.success) throw result.error

        const { commentId }: DeleteCommentInput = result.data

        // Check if comment exists and user is authorized
        const comment = await fastify.prisma.comment.findFirst({
          where: {
            id: commentId,
            isDeleted: false,
          },
          include: {
            post: true,
          },
        })

        if (!comment) {
          throw fastify.httpErrors.notFound('Comment not found')
        }

        // Check if user is the author or has admin privileges
        const isAuthor = comment.authorId === authenticatedRequest.user.id
        const userRole = await fastify.prisma.userRole.findUnique({
          where: { userId: authenticatedRequest.user.id },
        })

        const isAdmin =
          userRole?.role === 'ADMIN' || userRole?.role === 'MODERATOR'

        if (!isAuthor && !isAdmin) {
          throw fastify.httpErrors.forbidden(
            'Not authorized to delete this comment',
          )
        }

        await fastify.prisma.$transaction(async (tx) => {
          // Soft delete the comment
          await tx.comment.update({
            where: { id: commentId },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
            },
          })

          // Update post comments count
          await tx.post.update({
            where: { id: comment.postId },
            data: {
              commentsCount: { decrement: 1 },
            },
          })

          // Log activity
          await tx.userActivityLog.create({
            data: {
              userId: authenticatedRequest.user.id,
              action: 'COMMENT_DELETE',
              metadata: {
                commentId,
                postId: comment.postId,
              } as Prisma.InputJsonValue,
              ipAddress: authenticatedRequest.ip,
              userAgent: authenticatedRequest.headers['user-agent'] ?? null,
            },
          })
        })

        fastify.log.info(`[Comment] Deleted comment: ${commentId}`)

        return reply.status(200).send({
          success: true,
          message: 'Comment deleted successfully',
        })
      } catch (err) {
        return commentErrorHandler(authenticatedRequest, reply, err, context)
      }
    },
  )
}

export default deleteCommentRoute
