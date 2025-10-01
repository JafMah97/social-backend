import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { userErrorHandler } from '../userErrorHandler'

interface AuthenticatedRequest extends FastifyRequest {
  user?: NonNullable<FastifyRequest['user']>
}

type FollowingRow = {
  id: string
  followerId: string
  followingId: string
  following: {
    id: string
    username: string
    fullName: string | null
    profileImage: string | null
    isPrivate: boolean
    bio: string | null
  }
  followedAt: Date
}

type FollowingOut = {
  id: string
  username: string
  fullName: string | null
  profileImage: string | null
  isPrivate: boolean
  bio: string | null
  followedAt: Date
  isFollowedByCurrentUser: boolean
}

const getFollowingRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/following/:userId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const currentUserId = req.user?.id
      const { userId } = request.params as { userId: string }

      try {
        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, isPrivate: true },
        })

        if (!user) {
          throw {
            statusCode: 404,
            code: 'notFoundError',
            message: 'User not found',
          }
        }

        if (user.isPrivate && currentUserId !== userId) {
          const follows = await fastify.prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: currentUserId ?? '',
                followingId: userId,
              },
            },
          })

          if (!follows || follows.isPending || follows.isBlocked) {
            throw {
              statusCode: 403,
              code: 'privateProfile',
              message: 'Cannot view following of private account',
            }
          }
        }

        const { page = 1, limit = 20 } = request.query as {
          page?: number
          limit?: number
        }
        const skip = (page - 1) * limit

        const [following, totalCount] = await Promise.all([
          fastify.prisma.follow.findMany({
            where: {
              followerId: userId,
              isPending: false,
              isBlocked: false,
              isRemoved: false,
            },
            include: {
              following: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                  profileImage: true,
                  isPrivate: true,
                  bio: true,
                },
              },
            },
            orderBy: { followedAt: 'desc' },
            skip,
            take: limit,
          }) as Promise<FollowingRow[]>,
          fastify.prisma.follow.count({
            where: {
              followerId: userId,
              isPending: false,
              isBlocked: false,
              isRemoved: false,
            },
          }),
        ])

        const followingIds = following.map((f) => f.following.id)

        const followingSet = new Set<string>()
        if (currentUserId && followingIds.length > 0) {
          const currentUserFollows = await fastify.prisma.follow.findMany({
            where: {
              followerId: currentUserId,
              followingId: { in: followingIds },
              isPending: false,
              isBlocked: false,
              isRemoved: false,
            },
            select: { followingId: true },
          })
          for (const f of currentUserFollows) followingSet.add(f.followingId)
        }

        const followingOut: FollowingOut[] = following.map((f) => ({
          id: f.following.id,
          username: f.following.username,
          fullName: f.following.fullName,
          profileImage: f.following.profileImage,
          isPrivate: f.following.isPrivate,
          bio: f.following.bio,
          followedAt: f.followedAt,
          isFollowedByCurrentUser: !!followingSet.has(f.following.id),
        }))

        return reply.send({
          success: true,
          data: {
            following: followingOut,
            pagination: {
              page,
              limit,
              total: totalCount,
              pages: Math.ceil(totalCount / limit),
              hasNext: page * limit < totalCount,
              hasPrev: page > 1,
            },
          },
        })
      } catch (err) {
        return userErrorHandler(req, reply, err, {
          action: 'getFollowing',
          ...(currentUserId && { userId: currentUserId }),
        })
      }
    },
  )
}

export default getFollowingRoute
