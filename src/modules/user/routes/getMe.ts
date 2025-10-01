import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { userErrorHandler } from '../userErrorHandler'

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
}

const getMeRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/me',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user.id

      try {
        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            email: true,
            fullName: true,
            profileImage: true,
            coverImage: true,
            isPrivate: true,
            isProfileComplete: true,
            createdAt: true,
            updatedAt: true,
            isActive: true,
            emailVerified: true,
            lastLoginAt: true,
            bio: true,
            website: true,
            location: true,
            dateOfBirth: true,
            gender: true,
            // relation fields — names must match your Prisma schema (userSettings, userPreferences)
            userSettings: {
              select: {
                emailNotifications: true,
                pushNotifications: true,
                storyViewPrivacy: true,
                allowDirectMessages: true,
                showOnlineStatus: true,
                showReadReceipts: true,
                allowTagging: true,
                allowSharing: true,
                contentVisibility: true,
                createdAt: true,
                updatedAt: true,
              },
            },
            userPreferences: {
              select: {
                language: true,
                themeMode: true,
                timezone: true,
                locale: true,
                showSensitiveContent: true,
                defaultPostVisibility: true,
                itemsPerPage: true,
                layout: true,
                createdAt: true,
                updatedAt: true,
              },
            },
            _count: {
              select: {
                followers: true,
                following: true,
                Post: true,
              },
            },
          },
        })

        if (!user) {
          throw {
            statusCode: 404,
            code: 'notFoundError',
            message: 'User not found',
          }
        }

        req.log.info({ userId }, 'Fetched current user profile')

        return reply.send({
          success: true,
          data: user,
        })
      } catch (err) {
        return userErrorHandler(req, reply, err, {
          action: 'getMe',
          ...(req.user?.id && { userId: req.user.id }),
        })
      }
    },
  )
}

export default getMeRoute
