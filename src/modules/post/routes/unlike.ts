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

        // STEP 1 — Validate post exists
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
            message: 'Post not found.',
          }
        }

        // STEP 2 — Check existing like
        const existingLike = await fastify.prisma.postLike.findFirst({
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

        // STEP 3 — Batch transaction (atomic, no timeout)
        await fastify.prisma.$transaction([
          fastify.prisma.postLike.update({
            where: { id: existingLike.id },
            data: { isRemoved: true, removedAt: new Date() },
          }),

          fastify.prisma.post.update({
            where: { id: postId },
            data: { likesCount: { decrement: 1 } },
          }),

          fastify.prisma.userActivityLog.create({
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
          }),
        ])

        fastify.log.info(`[Post] User ${req.user.id} unliked post: ${postId}`)

        // STEP 4 — Recompute counts
        const [likesCount, commentsCount] = await fastify.prisma.$transaction([
          fastify.prisma.postLike.count({
            where: { postId: post.id, isRemoved: false },
          }),
          fastify.prisma.comment.count({
            where: { postId: post.id, isDeleted: false },
          }),
        ])

        const isSaved = !!(await fastify.prisma.savedPost.findFirst({
          where: { postId: post.id, userId, isRemoved: false },
        }))

        const dto: PostDTO = toPostDTO(post, {
          isLiked: false,
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
