import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { updateCommentSchema } from '../commentSchemas'
import { commentErrorHandler } from '../commentErrorHandler'
import type { Prisma } from '@prisma/client'

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
}

type UpdateCommentInput = z.infer<typeof updateCommentSchema>

const editCommentRoute: FastifyPluginAsync = async (fastify) => {
  fastify.put(
    '/edit',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        throw fastify.httpErrors.unauthorized('Authentication required')
      }

      const authenticatedRequest = request as AuthenticatedRequest
      const context = {
        action: 'edit_comment',
        userId: authenticatedRequest.user.id,
      }

      try {
        const result = updateCommentSchema.safeParse(request.body)
        if (!result.success) throw result.error

        const { commentId, content }: UpdateCommentInput = result.data

        // Check if comment exists and user is authorized
        const existingComment = await fastify.prisma.comment.findFirst({
          where: {
            id: commentId,
            isDeleted: false,
          },
        })

        if (!existingComment) {
          throw fastify.httpErrors.notFound('Comment not found')
        }

        if (existingComment.authorId !== authenticatedRequest.user.id) {
          throw fastify.httpErrors.forbidden(
            'Not authorized to edit this comment',
          )
        }

        const comment = await fastify.prisma.$transaction(async (tx) => {
          // Update the comment
          const updatedComment = await tx.comment.update({
            where: { id: commentId },
            data: {
              content,
              updatedAt: new Date(),
            },
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
                  commentLikes: {
                    where: { isRemoved: false },
                  },
                },
              },
            },
          })

          // Log activity
          await tx.userActivityLog.create({
            data: {
              userId: authenticatedRequest.user.id,
              action: 'COMMENT_UPDATE',
              metadata: {
                commentId,
                postId: updatedComment.postId,
              } as Prisma.InputJsonValue,
              ipAddress: authenticatedRequest.ip,
              userAgent: authenticatedRequest.headers['user-agent'] ?? null,
            },
          })

          return updatedComment
        })

        fastify.log.info(`[Comment] Updated comment: ${comment.id}`)

        return reply.status(200).send({
          success: true,
          data: {
            comment: {
              ...comment,
              likesCount: comment._count.commentLikes,
              isLiked: comment.commentLikes.some(
                (like) => like.userId === authenticatedRequest.user.id,
              ),
            },
          },
        })
      } catch (err) {
        return commentErrorHandler(authenticatedRequest, reply, err, context)
      }
    },
  )
}

export default editCommentRoute
