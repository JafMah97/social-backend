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

interface RouteParams {
  postId: string
  commentId: string
}

type UpdateCommentInput = z.infer<typeof updateCommentSchema>

const editCommentRoute: FastifyPluginAsync = async (fastify) => {
  fastify.put(
    '/edit/:postId/:commentId',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        throw fastify.httpErrors.unauthorized('Authentication required')
      }

      const authenticatedRequest = request as AuthenticatedRequest
      const userId = authenticatedRequest.user.id
      const { postId, commentId } = request.params as RouteParams

      const context = {
        action: 'edit_comment',
        userId,
      }

      try {
        const result = updateCommentSchema.safeParse(request.body)
        if (!result.success) throw result.error

        const { content }: UpdateCommentInput = result.data

        // Check if comment exists and user is authorized
        const existingComment = await fastify.prisma.comment.findFirst({
          where: {
            id: commentId,
            postId,
            isDeleted: false,
          },
        })

        if (!existingComment) {
          throw fastify.httpErrors.notFound('Comment not found')
        }

        if (existingComment.authorId !== userId) {
          throw fastify.httpErrors.forbidden(
            'Not authorized to edit this comment',
          )
        }

        // -----------------------------------------
        // STEP 1 — Update the comment
        // -----------------------------------------
        const updatedComment = await fastify.prisma.comment.update({
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
            _count: {
              select: {
                commentLikes: { where: { isRemoved: false } },
              },
            },
          },
        })

        // -----------------------------------------
        // STEP 2 — Log activity
        // -----------------------------------------
        await fastify.prisma.userActivityLog.create({
          data: {
            userId,
            action: 'COMMENT_UPDATE',
            metadata: {
              commentId,
              postId,
            } as Prisma.InputJsonValue,
            ipAddress: authenticatedRequest.ip,
            userAgent: authenticatedRequest.headers['user-agent'] ?? null,
          },
        })

        fastify.log.info(`[Comment] Updated comment: ${updatedComment.id}`)

        // -----------------------------------------
        // STEP 3 — Normalized response
        // -----------------------------------------
        const isLiked = !!(await fastify.prisma.commentLike.findFirst({
          where: {
            commentId,
            userId,
            isRemoved: false,
          },
        }))

        return reply.status(200).send({
          success: true,
          data: {
            comment: {
              id: updatedComment.id,
              postId: updatedComment.postId,
              content: updatedComment.content,
              createdAt: updatedComment.createdAt,
              updatedAt: updatedComment.updatedAt,
              likesCount: updatedComment._count.commentLikes,
              isLiked,
              author: {
                id: updatedComment.author.id,
                username: updatedComment.author.username,
                profileImage: updatedComment.author.profileImage,
                fullName: updatedComment.author.fullName,
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

export default editCommentRoute
