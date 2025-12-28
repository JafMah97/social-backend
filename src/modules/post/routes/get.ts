import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { getPostSchema } from '../postSchemas'
import { postErrorHandler } from '../postErrorHandler'
import { toPostDTO, type PostDTO } from '../dto/postDTO'

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
            message: 'Post not found or you do not have permission to view it.',
          }
        }

        const [likesCount, commentsCount] = await fastify.prisma.$transaction([
          fastify.prisma.postLike.count({
            where: { postId: post.id, isRemoved: false },
          }),
          fastify.prisma.comment.count({
            where: { postId: post.id, isDeleted: false },
          }),
        ])

        const isLiked = req.user
          ? !!(await fastify.prisma.postLike.findFirst({
              where: {
                postId: post.id,
                userId: req.user.id,
                isRemoved: false,
              },
            }))
          : false

        const isSaved = req.user
          ? !!(await fastify.prisma.savedPost.findFirst({
              where: {
                postId: post.id,
                userId: req.user.id,
                isRemoved: false,
              },
            }))
          : false

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
          message: 'Post fetched successfully.',
          data: { post: dto },
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
