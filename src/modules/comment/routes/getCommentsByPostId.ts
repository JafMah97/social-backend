import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { getCommentsByPostIdSchema } from '../commentSchemas.js'
import { commentErrorHandler } from '../commentErrorHandler.js'

interface AuthenticatedRequest extends FastifyRequest {
  user?: NonNullable<FastifyRequest['user']>
}

// Define proper types for params and query
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authenticatedRequest = request as AuthenticatedRequest

      // Fix the context type issue by making userId explicitly string | undefined
      const context = {
        action: 'get_comments_by_post_id' as string,
        userId: authenticatedRequest.user?.id as string,
      }

      try {
        // Type cast the params and query to fix the spread issue
        const params = request.params as RouteParams
        const query = request.query as RouteQuery

        const result = getCommentsByPostIdSchema.safeParse({
          postId: params.postId,
          page: query.page,
          limit: query.limit,
        })

        if (!result.success) throw result.error

        const { postId, page, limit }: GetCommentsByPostIdInput = result.data

        // Check if post exists
        const post = await fastify.prisma.post.findUnique({
          where: { id: postId, isDeleted: false },
        })

        if (!post) {
          throw fastify.httpErrors.notFound('Post not found')
        }

        const skip = (page - 1) * limit

        // Get comments with pagination
        const [comments, totalCount] = await Promise.all([
          fastify.prisma.comment.findMany({
            where: {
              postId,
              isDeleted: false,
            },
            include: {
              author: {
                select: {
                  id: true,
                  username: true,
                  profileImage: true,
                  fullName: true,
                },
              },
              commentLikes: {
                where: { isRemoved: false },
                select: { userId: true },
              },
              _count: {
                select: {
                  commentLikes: {
                    where: { isRemoved: false },
                  },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          fastify.prisma.comment.count({
            where: {
              postId,
              isDeleted: false,
            },
          }),
        ])

        const totalPages = Math.ceil(totalCount / limit)

        // Format comments with additional data
        const formattedComments = comments.map((comment) => ({
          id: comment.id,
          postId: comment.postId,
          authorId: comment.authorId,
          content: comment.content,
          authorUsername: comment.authorUsername,
          authorImage: comment.authorImage,
          isFlagged: comment.isFlagged,
          isDeleted: comment.isDeleted,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          author: comment.author,
          likesCount: comment._count.commentLikes,
          isLiked: comment.commentLikes.some(
            (like) => like.userId === authenticatedRequest.user?.id,
          ),
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
