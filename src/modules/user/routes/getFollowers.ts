import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { userErrorHandler } from '../userErrorHandler'

interface AuthenticatedRequest extends FastifyRequest {
  user?: NonNullable<FastifyRequest['user']>
}

type FollowerRow = {
  id: string
  followerId: string
  followingId: string
  followerUsername: string | null
  follower: {
    id: string
    username: string
    fullName: string | null
    profileImage: string | null
    isPrivate: boolean
    bio: string | null
  }
  followedAt: Date
}

type FollowerOut = {
  id: string
  username: string
  fullName: string | null
  profileImage: string | null
  isPrivate: boolean
  bio: string | null
  followedAt: Date
  isFollowedByCurrentUser: boolean
}

const getFollowersRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/followers/:userId',
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
              message: 'Cannot view followers of private account',
            }
          }
        }

        const { page = 1, limit = 20 } = request.query as {
          page?: number
          limit?: number
        }
        const skip = (page - 1) * limit

        const [followers, totalCount] = await Promise.all([
          fastify.prisma.follow.findMany({
            where: {
              followingId: userId,
              isPending: false,
              isBlocked: false,
              isRemoved: false,
            },
            include: {
              follower: {
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
          }) as Promise<FollowerRow[]>,
          fastify.prisma.follow.count({
            where: {
              followingId: userId,
              isPending: false,
              isBlocked: false,
              isRemoved: false,
            },
          }),
        ])

        const followerIds = followers.map((f) => f.follower.id)

        const followingSet = new Set<string>()
        if (currentUserId && followerIds.length > 0) {
          const currentUserFollows = await fastify.prisma.follow.findMany({
            where: {
              followerId: currentUserId,
              followingId: { in: followerIds },
              isPending: false,
              isBlocked: false,
              isRemoved: false,
            },
            select: { followingId: true },
          })
          for (const f of currentUserFollows) followingSet.add(f.followingId)
        }

        const followersOut: FollowerOut[] = followers.map((f) => ({
          id: f.follower.id,
          username: f.follower.username,
          fullName: f.follower.fullName,
          profileImage: f.follower.profileImage,
          isPrivate: f.follower.isPrivate,
          bio: f.follower.bio,
          followedAt: f.followedAt,
          isFollowedByCurrentUser: !!followingSet.has(f.follower.id),
        }))

        return reply.send({
          success: true,
          data: {
            followers: followersOut,
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
          action: 'getFollowers',
          ...(currentUserId && { userId: currentUserId }),
        })
      }
    },
  )
}

export default getFollowersRoute
