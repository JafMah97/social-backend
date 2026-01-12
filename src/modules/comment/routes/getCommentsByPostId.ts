import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { getCommentsByPostIdSchema } from '../commentSchemas'
import { commentErrorHandler } from '../commentErrorHandler'

interface AuthenticatedRequest extends FastifyRequest {
  user?: NonNullable<FastifyRequest['user']>
}

interface RouteParams {
  postId: string
}

interface RouteQuery {
  page?: string
  limit?: string
}

type GetCommentsByPostIdInput = z.infer<typeof getCommentsByPostIdSchema>

const getCommentsByPostIdRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/post/:postId',
    {preHandler:fastify.authenticate},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authenticatedRequest = request as AuthenticatedRequest
      const userId = authenticatedRequest.user?.id

      fastify.log.info(
        { userId, hasUser: !!authenticatedRequest.user },
        '[Comment] Debug → userId extracted from request',
      )

      const context = {
        action: 'get_comments_by_post_id' as string,
        userId:userId as string,
      }

      try {
        const params = request.params as RouteParams
        const query = request.query as RouteQuery

        const result = getCommentsByPostIdSchema.safeParse({
          postId: params.postId,
          page: query.page,
          limit: query.limit,
        })

        if (!result.success) throw result.error

        const { postId, page, limit }: GetCommentsByPostIdInput = result.data

        const post = await fastify.prisma.post.findUnique({
          where: { id: postId, isDeleted: false },
        })
        if (!post) {
          throw fastify.httpErrors.notFound('Post not found')
        }

        const skip = (page - 1) * limit

        const [comments, totalCount] = await Promise.all([
          fastify.prisma.comment.findMany({
            where: { postId, isDeleted: false },
            include: {
              author: {
                select: {
                  id: true,
                  username: true,
                  profileImage: true,
                  fullName: true,
                },
              },
              _count: {
                select: {
                  commentLikes: { where: { isRemoved: false } },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          fastify.prisma.comment.count({
            where: { postId, isDeleted: false },
          }),
        ])

        const totalPages = Math.ceil(totalCount / limit)

        // For efficiency: fetch all likes for this user across these comments
        let likedIds = new Set<string>()
        if (userId) {
          const userLikes = await fastify.prisma.commentLike.findMany({
            where: {
              userId,
              commentId: { in: comments.map((c) => c.id) },
              isRemoved: false,
            },
            select: { commentId: true },
          })
          likedIds = new Set(userLikes.map((l) => l.commentId))
        }

        const formattedComments = comments.map((comment) => ({
          id: comment.id,
          postId: comment.postId,
          content: comment.content,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          likesCount: comment._count.commentLikes,
          // ✅ Correct: isLiked is true if this user's active like exists
          isLiked: userId ? likedIds.has(comment.id) : false,
          author: {
            id: comment.author.id,
            username: comment.author.username,
            profileImage: comment.author.profileImage,
            fullName: comment.author.fullName,
          },
        }))

        fastify.log.info(
          `[Comment] Retrieved ${comments.length} comments for post: ${postId}`,
        )

        return reply.status(200).send({
          success: true,
          data: {
            comments: formattedComments,
            pagination: {
              currentPage: page,
              totalPages,
              totalCount,
              hasNext: page < totalPages,
              hasPrev: page > 1,
            },
          },
        })
      } catch (err) {
        return commentErrorHandler(authenticatedRequest, reply, err, context)
      }
    },
  )
}

export default getCommentsByPostIdRoute
