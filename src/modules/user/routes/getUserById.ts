// src/modules/user/routes/getUserById.ts
import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { userErrorHandler } from '../userErrorHandler.js'

interface AuthenticatedRequest extends FastifyRequest {
  userId?: string
}

interface UserParams {
  userId: string
}

type UserOut = {
  id: string
  username: string
  fullName: string
  profileImage: string
  coverImage: string | null
  bio: string | null
  website: string | null
  location: string | null
  isPrivate: boolean
  isActive: boolean
  isBanned: boolean
  emailVerified: boolean
  followersCount: number
  followingCount: number
  postsCount: number
  isFollowedByCurrentUser: boolean
  isFollowingCurrentUser: boolean
  isBlockedByCurrentUser: boolean
  updatedAt: Date
  createdAt: Date
}

const getUserByIdRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/:userId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const currentUserId = req.user?.id
      const { userId } = request.params as UserParams

      try {
        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            fullName: true,
            profileImage: true,
            coverImage: true,
            bio: true,
            website: true,
            location: true,
            isPrivate: true,
            isActive: true,
            isBanned: true,
            emailVerified: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                // Count followers (people who follow this user)
                followers: {
                  where: {
                    isPending: false,
                    isBlocked: false,
                    isRemoved: false,
                  },
                },
                // Count following (people this user follows)
                following: {
                  where: {
                    isPending: false,
                    isBlocked: false,
                    isRemoved: false,
                  },
                },
                Post: {
                  where: {
                    isDeleted: false,
                  },
                },
              },
            },
          },
        })

        if (!user) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'notFoundError',
              message: 'User not found',
            },
          })
        }

        // If profile is private and requester is not the same user, enforce visibility rules
        if (user.isPrivate && currentUserId !== userId) {
          // Check if current user follows target user and is allowed
          const followRecord = currentUserId
            ? await fastify.prisma.follow.findUnique({
                where: {
                  followerId_followingId: {
                    followerId: currentUserId,
                    followingId: userId,
                  },
                },
                select: {
                  id: true,
                  isPending: true,
                  isBlocked: true,
                },
              })
            : null

          // If no follow record exists or it's pending/blocked, deny access
          if (
            !followRecord ||
            followRecord.isPending ||
            followRecord.isBlocked
          ) {
            return reply.status(403).send({
              success: false,
              error: {
                code: 'privateProfile',
                message: 'This account is private',
              },
            })
          }
        }

        // Compute relationship flags if currentUserId present
        let isFollowedByCurrentUser = false
        let isFollowingCurrentUser = false
        let isBlockedByCurrentUser = false

        if (currentUserId && currentUserId !== userId) {
          const [currentUserFollowsTarget, targetFollowsCurrentUser] =
            await Promise.all([
              // Does current user follow requested user?
              fastify.prisma.follow.findUnique({
                where: {
                  followerId_followingId: {
                    followerId: currentUserId,
                    followingId: userId,
                  },
                },
                select: { id: true, isPending: true, isBlocked: true },
              }),
              // Does requested user follow current user?
              fastify.prisma.follow.findUnique({
                where: {
                  followerId_followingId: {
                    followerId: userId,
                    followingId: currentUserId,
                  },
                },
                select: { id: true, isPending: true, isBlocked: true },
              }),
            ])

          isFollowedByCurrentUser = !!(
            currentUserFollowsTarget &&
            !currentUserFollowsTarget.isPending &&
            !currentUserFollowsTarget.isBlocked
          )

          isFollowingCurrentUser = !!(
            targetFollowsCurrentUser &&
            !targetFollowsCurrentUser.isPending &&
            !targetFollowsCurrentUser.isBlocked
          )

          // Check if current user has blocked the target user
          // Note: You'll need to implement this based on your blocking logic
          // This is a placeholder - adjust according to your blocking implementation
          const blockRecord = await fastify.prisma.follow.findFirst({
            where: {
              followerId: currentUserId,
              followingId: userId,
              isBlocked: true,
            },
          })
          isBlockedByCurrentUser = !!blockRecord
        }

        const out: UserOut = {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          profileImage: user.profileImage,
          coverImage: user.coverImage,
          bio: user.bio,
          website: user.website,
          location: user.location,
          isPrivate: user.isPrivate,
          isActive: user.isActive,
          isBanned: user.isBanned,
          emailVerified: user.emailVerified,
          followersCount: user._count.followers,
          followingCount: user._count.following,
          postsCount: user._count.Post,
          isFollowedByCurrentUser,
          isFollowingCurrentUser,
          isBlockedByCurrentUser,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }

        return reply.send({
          success: true,
          data: out,
        })
      } catch (err) {
        return userErrorHandler(request, reply, err, {
          action: 'getUserById',
          ...(currentUserId && { userId: currentUserId }),
        })
      }
    },
  )
}

export default getUserByIdRoute
