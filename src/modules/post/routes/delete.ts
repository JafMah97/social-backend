// src/routes/posts/deletePost.ts
import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { deletePostSchema } from '../postSchemas'
import { postErrorHandler } from '../postErrorHandler'
import type { Prisma } from '@prisma/client'

type DeletePostInput = z.infer<typeof deletePostSchema>

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
  params: { postId: string }
}

const deletePostRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete(
    '/delete/:postId',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authenticatedRequest = request as AuthenticatedRequest
      const { postId: rawPostId } = authenticatedRequest.params

      const context = {
        action: 'delete_post',
        userId: authenticatedRequest.user.id,
        postId: rawPostId,
      }

      try {
        const result = deletePostSchema.safeParse({ postId: rawPostId })
        if (!result.success) throw result.error

        const { postId }: DeletePostInput = result.data

        await fastify.prisma.$transaction(async (tx) => {
          const updated = await tx.post.updateMany({
            where: {
              id: postId,
              authorId: authenticatedRequest.user.id,
              isDeleted: false,
            },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
            },
          })

          if (updated.count === 0) {
            throw {
              statusCode: 404,
              code: 'postNotFound',
              message:
                'Post not found or you do not have permission to delete it.',
            }
          }

          await tx.userActivityLog.create({
            data: {
              userId: authenticatedRequest.user.id,
              action: 'POST_DELETE',
              metadata: { postId } as Prisma.InputJsonValue,
              ipAddress: authenticatedRequest.ip,
              userAgent: authenticatedRequest.headers['user-agent'] ?? null,
            },
          })
        })

        fastify.log.info(`[Post] Deleted post: ${postId}`)

        return reply.send({
          success: true,
          message: 'Post deleted successfully.',
          data: { postId },
        })
      } catch (err) {
        return postErrorHandler(authenticatedRequest, reply, err, context)
      }
    },
  )
}

export default deletePostRoute
