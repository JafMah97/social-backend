import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { deleteCommentSchema } from '../commentSchemas'
import { commentErrorHandler } from '../commentErrorHandler'
import type { Prisma } from '@prisma/client'

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
  params: { commentId: string }
}

type DeleteCommentInput = z.infer<typeof deleteCommentSchema>

const deleteCommentRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete(
    '/delete/:commentId', // 🔑 param-based route
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        throw fastify.httpErrors.unauthorized('Authentication required')
      }

      const authenticatedRequest = request as AuthenticatedRequest
      const { commentId: rawCommentId } = authenticatedRequest.params

      const context = {
        action: 'delete_comment',
        userId: authenticatedRequest.user.id,
        commentId: rawCommentId,
      }

      try {
        // validate param using Zod schema
        const result = deleteCommentSchema.safeParse({
          commentId: rawCommentId,
        })
        if (!result.success) throw result.error

        const { commentId }: DeleteCommentInput = result.data

        // Check if comment exists and user is authorized
        const comment = await fastify.prisma.comment.findFirst({
          where: { id: commentId, isDeleted: false },
          include: { post: true },
        })

        if (!comment) {
          throw fastify.httpErrors.notFound('Comment not found')
        }

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

        const deletedAt = new Date()

        await fastify.prisma.$transaction(async (tx) => {
          await tx.comment.update({
            where: { id: commentId },
            data: { isDeleted: true, deletedAt },
          })

          await tx.post.update({
            where: { id: comment.postId },
            data: { commentsCount: { decrement: 1 } },
          })

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

        return reply.send({
          success: true,
          message: 'Comment deleted successfully',
          data: {
            commentId,
            postId: comment.postId,
            deletedAt: deletedAt.toISOString(),
          },
        })
      } catch (err) {
        return commentErrorHandler(authenticatedRequest, reply, err, context)
      }
    },
  )
}

export default deleteCommentRoute
