import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { getPostSchema } from '../postSchemas'
import { postErrorHandler } from '../postErrorHandler'

type GetPostInput = z.infer<typeof getPostSchema>

interface RequestParams {
  postId: string
}

interface RequestWithOptionalUser extends FastifyRequest {
  params: RequestParams
  user?: NonNullable<FastifyRequest['user']>
}

const getPostRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/get/:postId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as RequestWithOptionalUser
      const { postId: rawPostId } = req.params

      try {
        const result = getPostSchema.safeParse({ postId: rawPostId })
        if (!result.success) throw result.error
        const { postId }: GetPostInput = result.data

        // Build visibility filter explicitly
        const where = { id: postId, isDeleted: false }

        // Fetch post with related slices (tags, author, recent likes)
        const post = await fastify.prisma.post.findFirst({
          where,
          include: {
            tags: { include: { tag: true } },
            author: {
              select: {
                id: true,
                username: true,
                fullName: true,
                profileImage: true,
                isPrivate: true,
              },
            },
            PostLikes: {
              where: { isRemoved: false },
              take: 10,
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
            },
          },
        })

        if (!post) {
          throw {
            statusCode: 404,
            code: 'postNotFound',
            message: 'Post not found or you do not have permission to view it.',
          }
        }

        // Use explicit counts so we can filter isRemoved/isDeleted
        const [likesCount, commentsCount] = await fastify.prisma.$transaction([
          fastify.prisma.like.count({
            where: { postId: post.id, isRemoved: false },
          }),
          fastify.prisma.comment.count({
            where: { postId: post.id, isDeleted: false },
          }),
        ])

        return reply.send({
          success: true,
          data: {
            post: {
              ...post,
              likesCount,
              commentsCount,
            },
          },
        })
      } catch (err) {
        return postErrorHandler(req, reply, err, {
          action: 'get_post',
          postId: rawPostId,
          ...(req.user?.id ? { userId: req.user.id } : {}),
        })
      }
    },
  )
}

export default getPostRoute
