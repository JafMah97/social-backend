import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { userErrorHandler } from '../userErrorHandler'

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
}

const getSettingsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/settings',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user.id

      try {
        // Try to fetch both settings and preferences in parallel
        const [settings, preferences] = await Promise.all([
          fastify.prisma.userSettings.findUnique({
            where: { userId },
            select: {
              id: true,
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
          }),
          fastify.prisma.userPreferences.findUnique({
            where: { userId },
            select: {
              id: true,
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
          }),
        ])

        // If either is missing create defaults inside a transaction
        if (!settings || !preferences) {
          const [createdSettings, createdPreferences] =
            await fastify.prisma.$transaction(async (tx) => {
              const s =
                settings ??
                (await tx.userSettings.create({
                  data: {
                    userId,
                    // defaults are defined by the Prisma schema; only provide overrides if needed
                  },
                }))

              const p =
                preferences ??
                (await tx.userPreferences.create({
                  data: {
                    userId,
                  },
                }))

              return [s, p] as const
            })

          req.log.info({ userId }, 'Created default settings/preferences')

          return reply.send({
            success: true,
            data: {
              settings: {
                emailNotifications: createdSettings.emailNotifications,
                pushNotifications: createdSettings.pushNotifications,
                storyViewPrivacy: createdSettings.storyViewPrivacy,
                allowDirectMessages: createdSettings.allowDirectMessages,
                showOnlineStatus: createdSettings.showOnlineStatus,
                showReadReceipts: createdSettings.showReadReceipts,
                allowTagging: createdSettings.allowTagging,
                allowSharing: createdSettings.allowSharing,
                contentVisibility: createdSettings.contentVisibility,
                createdAt: createdSettings.createdAt,
                updatedAt: createdSettings.updatedAt,
              },
              preferences: {
                language: createdPreferences.language,
                themeMode: createdPreferences.themeMode,
                timezone: createdPreferences.timezone,
                locale: createdPreferences.locale,
                showSensitiveContent: createdPreferences.showSensitiveContent,
                defaultPostVisibility: createdPreferences.defaultPostVisibility,
                itemsPerPage: createdPreferences.itemsPerPage,
                layout: createdPreferences.layout,
                createdAt: createdPreferences.createdAt,
                updatedAt: createdPreferences.updatedAt,
              },
            },
          })
        }

        // both exist: return merged shape
        return reply.send({
          success: true,
          data: {
            settings: {
              emailNotifications: settings.emailNotifications,
              pushNotifications: settings.pushNotifications,
              storyViewPrivacy: settings.storyViewPrivacy,
              allowDirectMessages: settings.allowDirectMessages,
              showOnlineStatus: settings.showOnlineStatus,
              showReadReceipts: settings.showReadReceipts,
              allowTagging: settings.allowTagging,
              allowSharing: settings.allowSharing,
              contentVisibility: settings.contentVisibility,
              createdAt: settings.createdAt,
              updatedAt: settings.updatedAt,
            },
            preferences: {
              language: preferences.language,
              themeMode: preferences.themeMode,
              timezone: preferences.timezone,
              locale: preferences.locale,
              showSensitiveContent: preferences.showSensitiveContent,
              defaultPostVisibility: preferences.defaultPostVisibility,
              itemsPerPage: preferences.itemsPerPage,
              layout: preferences.layout,
              createdAt: preferences.createdAt,
              updatedAt: preferences.updatedAt,
            },
          },
        })
      } catch (err) {
        return userErrorHandler(req, reply, err, {
          action: 'getSettings',
          ...(req.user?.id && { userId: req.user.id }),
        })
      }
    },
  )
}

export default getSettingsRoute
