// src/routes/posts/unlikePost.ts
import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { likePostSchema } from '../postSchemas'
import { postErrorHandler } from '../postErrorHandler'
import type { Prisma } from '@prisma/client'

type LikePostInput = z.infer<typeof likePostSchema>

interface RequestParams {
  postId: string
}

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
  params: RequestParams
}

const unlikePostRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/unlike/:postId',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const { postId: rawPostId } = req.params

      try {
        const result = likePostSchema.safeParse({ postId: rawPostId })
        if (!result.success) throw result.error
        const { postId }: LikePostInput = result.data
        const userId = req.user.id

        // Perform the read + updates + log inside one transaction to avoid races
        const txResult = await fastify.prisma.$transaction(async (tx) => {
          // Ensure post exists and is not deleted
          const post = await tx.post.findFirst({
            where: { id: postId, isDeleted: false },
            select: { id: true, likesCount: true },
          })

          if (!post) {
            throw {
              statusCode: 404,
              code: 'postNotFound',
              message: 'Post not found.',
            }
          }

          // Find an existing active like
          const existingLike = await tx.like.findFirst({
            where: { postId, userId, isRemoved: false },
            select: { id: true },
          })

          if (!existingLike) {
            throw {
              statusCode: 409,
              code: 'notLiked',
              message: 'You have not liked this post.',
            }
          }

          // Mark the like as removed
          await tx.like.update({
            where: { id: existingLike.id },
            data: { isRemoved: true, removedAt: new Date() },
          })

          // Decrement likes counter atomically
          // Use decrement to avoid a second read-modify-write outside the transaction
          await tx.post.update({
            where: { id: postId },
            data: { likesCount: { decrement: 1 } },
          })

          // Log the activity
          await tx.userActivityLog.create({
            data: {
              userId,
              action: 'POST_UNLIKE',
              metadata: {
                postId,
                likeId: existingLike.id,
              } as Prisma.InputJsonValue,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'] ?? null,
            },
          })

          return { likeId: existingLike.id }
        })

        fastify.log.info(`[Post] User ${req.user.id} unliked post: ${postId}`)

        return reply.send({
          success: true,
          message: 'Post unliked successfully.',
          data: { likeId: txResult.likeId },
        })
      } catch (err) {
        return postErrorHandler(req, reply, err, {
          action: 'unlike_post',
          postId: rawPostId,
          userId: req.user.id,
        })
      }
    },
  )
}

export default unlikePostRoute
