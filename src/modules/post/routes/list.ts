// src/modules/posts/routes/listPostsRoute.ts
import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { listPostsSchema, type ListPostsInput } from '../postSchemas'
import { postErrorHandler } from '../postErrorHandler'
import type { Prisma } from '@prisma/client'
import { toPostDTO, type PostDTO } from '../dto/postDTO'

interface AuthenticatedRequest extends FastifyRequest {
  user?: NonNullable<FastifyRequest['user']>
}

const MAX_LIMIT = 50

const listPostsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/list',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest


      try {
        // Zod will coerce strings to numbers, so we can pass req.query directly
        const parsed = listPostsSchema.safeParse(req.query)
        if (!parsed.success) throw parsed.error

        const { page, limit, authorId, format }: ListPostsInput = parsed.data
        const cappedLimit = Math.min(limit, MAX_LIMIT)
        const skip = (page - 1) * cappedLimit
        const userId = req.user?.id

        const whereBase: Prisma.PostWhereInput = {
          isDeleted: false,
          ...(authorId ? { authorId } : {}),
          ...(format ? { format } : {}),
        }

        const where: Prisma.PostWhereInput = userId
          ? {
              ...whereBase,
              OR: [
                { visibility: 'PUBLIC' },
                { authorId: userId },
                {
                  visibility: 'FOLLOWERS_ONLY',
                  author: { followers: { some: { followerId: userId } } },
                },
              ],
            }
          : { ...whereBase, visibility: 'PUBLIC' }

        const [posts, total] = await fastify.prisma.$transaction([
          fastify.prisma.post.findMany({
            where,
            skip,
            take: cappedLimit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
            },
          }),
          fastify.prisma.post.count({ where }),
        ])

        const postIds = posts.map((p) => p.id)

        const [likesGroup, commentsGroup] = await fastify.prisma.$transaction([
          fastify.prisma.postLike.groupBy({
            by: ['postId'],
            where: { postId: { in: postIds }, isRemoved: false },
            _count: { _all: true },
          }),
          fastify.prisma.comment.groupBy({
            by: ['postId'],
            where: { postId: { in: postIds }, isDeleted: false },
            _count: { _all: true },
          }),
        ])

        const likesMap = new Map<string, number>()
        for (const g of likesGroup) {
          likesMap.set(g.postId, (g._count as { _all: number })._all)
        }

        const commentsMap = new Map<string, number>()
        for (const g of commentsGroup) {
          commentsMap.set(g.postId, (g._count as { _all: number })._all)
        }

        const resultPosts: PostDTO[] = await Promise.all(
          posts.map(async (post) => {
            const isLiked = userId
              ? !!(await fastify.prisma.postLike.findFirst({
                  where: { postId: post.id, userId, isRemoved: false },
                }))
              : false

            const isSaved = userId
              ? !!(await fastify.prisma.savedPost.findFirst({
                  where: { postId: post.id, userId, isRemoved: false },
                }))
              : false

            const dto = toPostDTO(post, {
              isLiked,
              isSaved,
              tags: post.tags.map((t) => t.tag.name),
            })
            dto.likesCount = likesMap.get(post.id) ?? 0
            dto.commentsCount = commentsMap.get(post.id) ?? 0
            dto.viewsCount = post.viewsCount
            return dto
          }),
        )

        return reply.send({
          success: true,
          data: {
            posts: resultPosts,
            pagination: {
              page,
              limit: cappedLimit,
              total,
              pages: Math.ceil(total / cappedLimit),
            },
          },
        })
      } catch (err) {
        return postErrorHandler(req, reply, err, {
          action: 'list_posts',
          ...(req.user?.id ? { userId: req.user.id } : {}),
        })
      }
    },
  )
}

export default listPostsRoute
