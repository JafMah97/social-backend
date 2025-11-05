import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { savePostSchema } from '../postSchemas.js'
import { postErrorHandler } from '../postErrorHandler.js'
import type { Prisma } from '@prisma/client'

type SavePostInput = z.infer<typeof savePostSchema>

interface RequestParams {
  postId: string
}

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
  params: RequestParams
}

const unsavePostRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/unsave/:postId',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const { postId: rawPostId } = req.params

      try {
        const result = savePostSchema.safeParse({ postId: rawPostId })
        if (!result.success) throw result.error
        const { postId }: SavePostInput = result.data
        const userId = req.user.id

        const txResult = await fastify.prisma.$transaction(async (tx) => {
          const post = await tx.post.findFirst({
            where: { id: postId, isDeleted: false },
            select: { id: true },
          })

          if (!post) {
            throw {
              statusCode: 404,
              code: 'postNotFound',
              message: 'Post not found.',
            }
          }

          const existingSave = await tx.savedPost.findFirst({
            where: { postId, userId, isRemoved: false },
            select: { id: true },
          })

          if (!existingSave) {
            throw {
              statusCode: 409,
              code: 'notSaved',
              message: 'You have not saved this post.',
            }
          }

          const updatedSaved = await tx.savedPost.update({
            where: { id: existingSave.id },
            data: { isRemoved: true, removedAt: new Date() },
            include: {
              post: {
                include: {
                  author: {
                    select: {
                      id: true,
                      username: true,
                      fullName: true,
                      profileImage: true,
                    },
                  },
                },
              },
            },
          })

          await tx.userActivityLog.create({
            data: {
              userId,
              action: 'POST_UNSAVE',
              metadata: {
                postId,
                savedPostId: existingSave.id,
              } as Prisma.InputJsonValue,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'] ?? null,
            },
          })

          return updatedSaved
        })

        fastify.log.info(`[Post] User ${req.user.id} unsaved post: ${postId}`)

        return reply.send({
          success: true,
          message: 'Post unsaved successfully.',
          data: { savedPost: txResult },
        })
      } catch (err) {
        return postErrorHandler(req, reply, err, {
          action: 'unsave_post',
          postId: rawPostId,
          userId: req.user.id,
        })
      }
    },
  )
}

export default unsavePostRoute
