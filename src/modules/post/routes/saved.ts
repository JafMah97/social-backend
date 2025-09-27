import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { listSavedPostsSchema } from '../postSchemas'
import { postErrorHandler } from '../postErrorHandler'
import type { Prisma } from '@prisma/client'

type ListSavedPostsInput = z.infer<typeof listSavedPostsSchema>

interface AuthenticatedRequest extends FastifyRequest {
  user?: NonNullable<FastifyRequest['user']>
}

const MAX_LIMIT = 50

const savedPostsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/saved',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest

      try {
        const parsed = listSavedPostsSchema.safeParse(req.query)
        if (!parsed.success) throw parsed.error

        const { page, limit }: ListSavedPostsInput = parsed.data
        const cappedLimit = Math.min(limit, MAX_LIMIT)
        const skip = (page - 1) * cappedLimit
        const userId = req.user!.id

        const where: Prisma.SavedPostWhereInput = {
          userId,
          isRemoved: false,
          post: {
            isDeleted: false,
            OR: [
              { visibility: 'PUBLIC' },
              { authorId: userId },
              {
                visibility: 'FOLLOWERS_ONLY',
                author: { followers: { some: { followerId: userId } } },
              },
            ],
          },
        }

        // Fetch saved posts page + total count
        const [savedPosts, total] = await fastify.prisma.$transaction([
          fastify.prisma.savedPost.findMany({
            where,
            skip,
            take: cappedLimit,
            orderBy: { savedAt: 'desc' },
            include: {
              post: {
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
                  // avoid pulling full comment lists
                  comments: {
                    where: { isDeleted: false },
                    select: { id: true },
                    take: 0,
                  },
                },
              },
            },
          }),
          fastify.prisma.savedPost.count({ where }),
        ])

        const validSavedPosts = savedPosts.filter((sp) => sp.post !== null)
        if (validSavedPosts.length === 0) {
          return reply.send({
            success: true,
            data: {
              savedPosts: [],
              pagination: {
                page,
                limit: cappedLimit,
                total,
                pages: Math.ceil(total / cappedLimit),
              },
            },
          })
        }

        // Collect postIds and aggregate counts with groupBy
        const postIds = validSavedPosts.map((sp) => sp.post!.id)

        const [likesGroup, commentsGroup] = await fastify.prisma.$transaction([
          fastify.prisma.like.groupBy({
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

        // Type-safe extraction of _count._all
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

        const mapped = validSavedPosts.map((savedPost) => {
          const post = savedPost.post!
          return {
            id: savedPost.id,
            savedAt: savedPost.savedAt,
            post: {
              ...post,
              tags: post.tags.map((pt) => pt.tag),
              likesCount: likesMap.get(post.id) ?? post.PostLikes.length,
              commentsCount: commentsMap.get(post.id) ?? 0,
            },
          }
        })

        return reply.send({
          success: true,
          data: {
            savedPosts: mapped,
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
          action: 'list_saved_posts',
          userId: req.user!.id,
        })
      }
    },
  )
}

export default savedPostsRoute
