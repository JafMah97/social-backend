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

        const existing = await fastify.prisma.postLike.findFirst({
          where: { postId, userId: authenticatedRequest.user.id },
        })

        if (existing && !existing.isRemoved) {
          throw {
            statusCode: 409,
            code: 'alreadyLiked',
            message: 'You have already liked this post.',
          }
        }

        await fastify.prisma.$transaction([
          fastify.prisma.postLike.deleteMany({
            where: { postId, userId: authenticatedRequest.user.id },
          }),

          fastify.prisma.postLike.create({
            data: {
              postId,
              userId: authenticatedRequest.user.id,
            },
          }),

          fastify.prisma.post.update({
            where: { id: postId },
            data: { likesCount: { increment: 1 } },
          }),

          fastify.prisma.userActivityLog.create({
            data: {
              userId: authenticatedRequest.user.id,
              action: 'POST_LIKE',
              metadata: { postId } as Prisma.InputJsonValue,
              ipAddress: authenticatedRequest.ip,
              userAgent: authenticatedRequest.headers['user-agent'] ?? null,
            },
          }),
        ])

        fastify.log.info(
          `[Post] User ${authenticatedRequest.user.id} liked post: ${postId}`,
        )

        const [likesCount, commentsCount] = await fastify.prisma.$transaction([
          fastify.prisma.postLike.count({
            where: { postId: post.id, isRemoved: false },
          }),
          fastify.prisma.comment.count({
            where: { postId: post.id, isDeleted: false },
          }),
        ])

        const dto: PostDTO = toPostDTO(post, {
          isLiked: true,
          isSaved: false,
          tags: post.tags.map((t) => t.tag.name),
        })
        dto.likesCount = likesCount
        dto.commentsCount = commentsCount
        dto.viewsCount = post.viewsCount

        return reply.send({
          success: true,
          message: 'Post liked successfully.',
          data: { post: dto },
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
