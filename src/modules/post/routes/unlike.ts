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
import { toPostDTO, type PostDTO } from '../dto/postDTO'

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

        // Perform the read + updates + log inside one transaction
        await fastify.prisma.$transaction(async (tx) => {
          const post = await tx.post.findFirst({
            where: { id: postId, isDeleted: false },
          })

          if (!post) {
            throw {
              statusCode: 404,
              code: 'postNotFound',
              message: 'Post not found.',
            }
          }

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

          await tx.like.update({
            where: { id: existingLike.id },
            data: { isRemoved: true, removedAt: new Date() },
          })

          await tx.post.update({
            where: { id: postId },
            data: { likesCount: { decrement: 1 } },
          })

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
        })

        fastify.log.info(`[Post] User ${req.user.id} unliked post: ${postId}`)

        // Re-fetch post with author/tags for DTO mapping
        const post = await fastify.prisma.post.findFirst({
          where: { id: postId, isDeleted: false },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                fullName: true,
                profileImage: true,
                isPrivate: true,
              },
            },
            tags: { include: { tag: true } },
          },
        })

        if (!post) {
          throw {
            statusCode: 404,
            code: 'postNotFound',
            message: 'Post not found after unlike.',
          }
        }

        const [likesCount, commentsCount] = await fastify.prisma.$transaction([
          fastify.prisma.like.count({
            where: { postId: post.id, isRemoved: false },
          }),
          fastify.prisma.comment.count({
            where: { postId: post.id, isDeleted: false },
          }),
        ])

        const isLiked = false // just unliked
        const isSaved = !!(await fastify.prisma.savedPost.findFirst({
          where: { postId: post.id, userId, isRemoved: false },
        }))

        const dto: PostDTO = toPostDTO(post, {
          isLiked,
          isSaved,
          tags: post.tags.map((t) => t.tag.name),
        })
        dto.likesCount = likesCount
        dto.commentsCount = commentsCount
        dto.viewsCount = post.viewsCount

        return reply.send({
          success: true,
          message: 'Post unliked successfully.',
          data: { post: dto },
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
