import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { userErrorHandler } from '../userErrorHandler.js'

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
}

// shape returned by Prisma select in this file
type UserSelectRow = {
  id: string
  username: string
  fullName: string | null
  profileImage: string | null
  isPrivate: boolean
  bio: string | null
  _count: {
    followers: number
    Post?: number
  }
}

type SuggestionOut = {
  id: string
  username: string
  fullName: string | null
  profileImage: string | null
  isPrivate: boolean
  bio: string | null
  followersCount: number
  mutualFollowersCount?: number
  isFollowedByCurrentUser?: boolean
}

const suggestionsRoute: FastifyPluginAsync = async (fastify) => {
  // GET suggested users to follow (requires auth)
  fastify.get(
    '/suggestions',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user.id

      try {
        const { limit = 10 } = request.query as { limit?: number }

        const mutualSuggestions = (await fastify.prisma.user.findMany({
          where: {
            AND: [
              { id: { not: userId } },
              { isActive: true },
              { isBanned: false },
              {
                followers: {
                  none: {
                    followerId: userId,
                    isPending: false,
                    isBlocked: false,
                    isRemoved: false,
                  },
                },
              },
              {
                followers: {
                  some: {
                    follower: {
                      followers: {
                        some: {
                          followerId: userId,
                          isPending: false,
                          isBlocked: false,
                          isRemoved: false,
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
          select: {
            id: true,
            username: true,
            fullName: true,
            profileImage: true,
            isPrivate: true,
            bio: true,
            _count: {
              select: {
                followers: {
                  where: {
                    isPending: false,
                    isBlocked: false,
                    isRemoved: false,
                  },
                },
              },
            },
          },
          orderBy: {
            followers: {
              _count: 'desc',
            },
          },
          take: limit,
        })) as UserSelectRow[]

        let additionalSuggestions: UserSelectRow[] = []
        if (mutualSuggestions.length < limit) {
          const remaining = limit - mutualSuggestions.length
          additionalSuggestions = (await fastify.prisma.user.findMany({
            where: {
              AND: [
                { id: { not: userId } },
                { isActive: true },
                { isBanned: false },
                {
                  followers: {
                    none: {
                      followerId: userId,
                      isPending: false,
                      isBlocked: false,
                      isRemoved: false,
                    },
                  },
                },
                {
                  id: {
                    notIn: mutualSuggestions.map((u) => u.id),
                  },
                },
              ],
            },
            select: {
              id: true,
              username: true,
              fullName: true,
              profileImage: true,
              isPrivate: true,
              bio: true,
              _count: {
                select: {
                  followers: {
                    where: {
                      isPending: false,
                      isBlocked: false,
                      isRemoved: false,
                    },
                  },
                },
              },
            },
            orderBy: {
              followers: {
                _count: 'desc',
              },
            },
            take: remaining,
          })) as UserSelectRow[]
        }

        const allSuggestions = [...mutualSuggestions, ...additionalSuggestions]

        const suggestionsWithMutuals: SuggestionOut[] = await Promise.all(
          allSuggestions.map(async (user) => {
            const mutualFollowersCount = await fastify.prisma.follow.count({
              where: {
                followingId: user.id,
                follower: {
                  followers: {
                    some: {
                      followerId: userId,
                      isPending: false,
                      isBlocked: false,
                      isRemoved: false,
                    },
                  },
                },
              },
            })

            return {
              id: user.id,
              username: user.username,
              fullName: user.fullName,
              profileImage: user.profileImage,
              isPrivate: user.isPrivate,
              bio: user.bio,
              followersCount: user._count.followers,
              mutualFollowersCount,
            }
          }),
        )

        return reply.send({
          success: true,
          data: {
            suggestions: suggestionsWithMutuals,
            count: suggestionsWithMutuals.length,
          },
        })
      } catch (err) {
        return userErrorHandler(req, reply, err, {
          action: 'getFollowSuggestions',
          userId: req.user.id,
        })
      }
    },
  )
}

export default suggestionsRoute
