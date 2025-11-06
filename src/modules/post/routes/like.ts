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

const likePostRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/like/:postId',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authenticatedRequest = request as AuthenticatedRequest
      const { postId: rawPostId } = authenticatedRequest.params

      try {
        const result = likePostSchema.safeParse({ postId: rawPostId })
        if (!result.success) throw result.error
        const { postId }: LikePostInput = result.data

        const post = await fastify.prisma.post.findFirst({
          where: { id: postId, isDeleted: false },
        })

        if (!post) {
          throw {
            statusCode: 404,
            code: 'postNotFound',
            message: 'Post not found.',
          }
        }

        const like = await fastify.prisma.$transaction(async (tx) => {
          const existing = await tx.like.findFirst({
            where: { postId, userId: authenticatedRequest.user.id },
          })

          if (existing && !existing.isRemoved) {
            throw {
              statusCode: 409,
              code: 'alreadyLiked',
              message: 'You have already liked this post.',
            }
          }

          await tx.like.deleteMany({
            where: { postId, userId: authenticatedRequest.user.id },
          })

          const created = await tx.like.create({
            data: {
              postId,
              userId: authenticatedRequest.user.id,
            },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                  profileImage: true,
                },
              },
            },
          })

          await tx.post.update({
            where: { id: postId },
            data: { likesCount: { increment: 1 } },
          })

          await tx.userActivityLog.create({
            data: {
              userId: authenticatedRequest.user.id,
              action: 'POST_LIKE',
              metadata: { postId, likeId: created.id } as Prisma.InputJsonValue,
              ipAddress: authenticatedRequest.ip,
              userAgent: authenticatedRequest.headers['user-agent'] ?? null,
            },
          })

          return created
        })

        fastify.log.info(
          `[Post] User ${authenticatedRequest.user.id} liked post: ${postId}`,
        )

        return reply.send({
          success: true,
          message: 'Post liked successfully.',
          data: { like },
        })
      } catch (err) {
        return postErrorHandler(authenticatedRequest, reply, err, {
          action: 'like_post',
          postId: rawPostId,
          userId: authenticatedRequest.user.id,
        })
      }
    },
  )
}

export default likePostRoute
