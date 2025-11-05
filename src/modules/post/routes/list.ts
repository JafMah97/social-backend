import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { listPostsSchema } from '../postSchemas.js'
import { postErrorHandler } from '../postErrorHandler.js'
import type { Prisma } from '@prisma/client'

type ListPostsInput = z.infer<typeof listPostsSchema>

interface AuthenticatedRequest extends FastifyRequest {
  user?: NonNullable<FastifyRequest['user']>
}

const MAX_LIMIT = 50

const listPostsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/list', async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as AuthenticatedRequest

    try {
      const parsed = listPostsSchema.safeParse(req.query)
      if (!parsed.success) throw parsed.error

      const { page, limit, authorId, format }: ListPostsInput = parsed.data
      const cappedLimit = Math.min(limit, MAX_LIMIT)
      const skip = (page - 1) * cappedLimit
      const userId = req.user?.id

      // Base where
      const whereBase: Prisma.PostWhereInput = {
        isDeleted: false,
        ...(authorId ? { authorId } : {}),
        ...(format ? { format } : {}),
      }

      // Visibility rules
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

      // Fetch posts and total count in a single transaction
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
            // small preview of recent likes
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
            // do not pull full comment lists; we'll count them separately
            comments: {
              where: { isDeleted: false },
              select: { id: true },
              take: 0,
            },
          },
        }),
        fastify.prisma.post.count({ where }),
      ])

      // If no posts, return empty response quickly
      if (posts.length === 0) {
        return reply.send({
          success: true,
          data: {
            posts: [],
            pagination: {
              page,
              limit: cappedLimit,
              total,
              pages: Math.ceil(total / cappedLimit),
            },
          },
        })
      }

      const postIds = posts.map((p) => p.id)

      // Aggregate counts per post using groupBy to avoid N+1 queries
      const [likesGroup, commentsGroup] = await fastify.prisma.$transaction([
        fastify.prisma.postLike.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds }, isRemoved: false },
          _count: { _all: true },
          orderBy: { postId: 'asc' },
        }),
        fastify.prisma.comment.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds }, isDeleted: false },
          _count: { _all: true },
          orderBy: { postId: 'asc' },
        }),
      ])

      const likesMap = new Map<string, number>()
      for (const g of likesGroup) {
        const count =
          typeof g._count === 'object' &&
          g._count !== null &&
          '_all' in g._count
            ? (g._count as { _all: number })._all
            : 0
        likesMap.set(g.postId, count)
      }

      const commentsMap = new Map<string, number>()
      for (const g of commentsGroup) {
        const count =
          typeof g._count === 'object' &&
          g._count !== null &&
          '_all' in g._count
            ? (g._count as { _all: number })._all
            : 0
        commentsMap.set(g.postId, count)
      }

      const resultPosts = posts.map((post) => ({
        ...post,
        tags: post.tags.map((pt) => pt.tag),
        likesCount: likesMap.get(post.id) ?? 0,
        commentsCount: commentsMap.get(post.id) ?? 0,
      }))

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
  })
}

export default listPostsRoute
