import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { createCommentSchema } from '../commentSchemas'
import { commentErrorHandler } from '../commentErrorHandler'
import type { Prisma } from '@prisma/client'

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
}

type CreateCommentInput = z.infer<typeof createCommentSchema>

const createCommentRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/create',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        throw fastify.httpErrors.unauthorized('Authentication required')
      }

      const authenticatedRequest = request as AuthenticatedRequest
      const context = {
        action: 'create_comment',
        userId: authenticatedRequest.user.id,
      }

      try {
        const result = createCommentSchema.safeParse(request.body)
        if (!result.success) throw result.error

        const { postId, content }: CreateCommentInput = result.data

        // Check if post exists
        const post = await fastify.prisma.post.findUnique({
          where: { id: postId, isDeleted: false },
        })

        if (!post) {
          throw fastify.httpErrors.notFound('Post not found')
        }

        // -----------------------------------------
        // STEP 1 — Create the comment (no transaction)
        // -----------------------------------------
        const createdComment = await fastify.prisma.comment.create({
          data: {
            postId,
            authorId: authenticatedRequest.user.id,
            content,
            authorUsername: authenticatedRequest.user.username,
            authorImage: authenticatedRequest.user.profileImage,
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

        // -----------------------------------------
        // STEP 2 — Safe batch transaction
        // -----------------------------------------
        await fastify.prisma.$transaction([
          fastify.prisma.post.update({
            where: { id: postId },
            data: {
              commentsCount: { increment: 1 },
            },
          }),

          fastify.prisma.commentAuthorInfo.create({
            data: {
              commentId: createdComment.id,
              authorId: authenticatedRequest.user.id,
              authorUsername: authenticatedRequest.user.username,
              authorImage: authenticatedRequest.user.profileImage,
            },
          }),

          fastify.prisma.userActivityLog.create({
            data: {
              userId: authenticatedRequest.user.id,
              action: 'COMMENT_CREATE',
              metadata: {
                postId,
                commentId: createdComment.id,
              } as Prisma.InputJsonValue,
              ipAddress: authenticatedRequest.ip,
              userAgent: authenticatedRequest.headers['user-agent'] ?? null,
            },
          }),
        ])

        fastify.log.info(`[Comment] Created comment: ${createdComment.id}`)

        return reply.status(201).send({
          success: true,
          data: {
            comment: {
              ...createdComment,
              likesCount: createdComment._count.commentLikes,
              isLiked: createdComment.commentLikes.some(
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

export default createCommentRoute
