import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { userSettingsSchema } from '../userSchemas'
import { userErrorHandler } from '../userErrorHandler'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'

type UserSettingsInput = z.infer<typeof userSettingsSchema>

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
  body: unknown
}

/**
 * Assigns a property to `target` only when `value !== undefined`.
 * K is constrained to string|number|symbol so String(key) is safe.
 */
function assignIfDefined<
  T extends object,
  K extends string | number | symbol,
  V,
>(target: T, key: K, value: V | undefined): void {
  if (value === undefined) return
  ;(target as unknown as Record<string, unknown>)[String(key)] =
    value as unknown
}

const updateSettingsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.put(
    '/update-settings',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user.id

      try {
        const parseResult = userSettingsSchema.safeParse(req.body)
        if (!parseResult.success) throw parseResult.error
        const settingsData: UserSettingsInput = parseResult.data

        const createData: Prisma.UserSettingsCreateInput = {
          user: { connect: { id: userId } },
        }

        // NOTE: updatedAt must be a FieldUpdateOperationsInput for Prisma update types
        const updateData: Prisma.UserSettingsUpdateInput = {
          updatedAt: { set: new Date() },
        }

        if (settingsData.emailNotifications !== undefined) {
          assignIfDefined(
            createData,
            'emailNotifications',
            settingsData.emailNotifications,
          )
          assignIfDefined(updateData, 'emailNotifications', {
            set: settingsData.emailNotifications,
          })
        }

        if (settingsData.pushNotifications !== undefined) {
          assignIfDefined(
            createData,
            'pushNotifications',
            settingsData.pushNotifications,
          )
          assignIfDefined(updateData, 'pushNotifications', {
            set: settingsData.pushNotifications,
          })
        }

        if (settingsData.storyViewPrivacy !== undefined) {
          assignIfDefined(
            createData,
            'storyViewPrivacy',
            settingsData.storyViewPrivacy,
          )
          assignIfDefined(updateData, 'storyViewPrivacy', {
            set: settingsData.storyViewPrivacy,
          })
        }

        if (settingsData.allowDirectMessages !== undefined) {
          assignIfDefined(
            createData,
            'allowDirectMessages',
            settingsData.allowDirectMessages,
          )
          assignIfDefined(updateData, 'allowDirectMessages', {
            set: settingsData.allowDirectMessages,
          })
        }

        if (settingsData.showOnlineStatus !== undefined) {
          assignIfDefined(
            createData,
            'showOnlineStatus',
            settingsData.showOnlineStatus,
          )
          assignIfDefined(updateData, 'showOnlineStatus', {
            set: settingsData.showOnlineStatus,
          })
        }

        if (settingsData.showReadReceipts !== undefined) {
          assignIfDefined(
            createData,
            'showReadReceipts',
            settingsData.showReadReceipts,
          )
          assignIfDefined(updateData, 'showReadReceipts', {
            set: settingsData.showReadReceipts,
          })
        }

        if (settingsData.allowTagging !== undefined) {
          assignIfDefined(createData, 'allowTagging', settingsData.allowTagging)
          assignIfDefined(updateData, 'allowTagging', {
            set: settingsData.allowTagging,
          })
        }

        if (settingsData.allowSharing !== undefined) {
          assignIfDefined(createData, 'allowSharing', settingsData.allowSharing)
          assignIfDefined(updateData, 'allowSharing', {
            set: settingsData.allowSharing,
          })
        }

        if (settingsData.contentVisibility !== undefined) {
          assignIfDefined(
            createData,
            'contentVisibility',
            settingsData.contentVisibility,
          )
          assignIfDefined(updateData, 'contentVisibility', {
            set: settingsData.contentVisibility,
          })
        }

        const result = await fastify.prisma.$transaction(async (tx) => {
          const existing = await tx.userSettings.findUnique({
            where: { userId },
          })

          if (!existing) {
            await tx.userSettings.create({ data: createData })
          } else {
            await tx.userSettings.update({
              where: { userId },
              data: updateData,
            })
          }

          return tx.userSettings.findUnique({
            where: { userId },
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
          })
        })

        if (settingsData.contentVisibility !== undefined) {
          await fastify.prisma.userActivityLog.create({
            data: {
              userId,
              action: 'ACCOUNT_PRIVACY_CHANGE',
              metadata: {
                contentVisibility: settingsData.contentVisibility,
              } as Prisma.InputJsonValue,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'] ?? null,
            },
          })
        }

        req.log.info({ userId }, 'Updated user settings')

        return reply.send({
          success: true,
          message: 'Settings updated successfully',
          data: result,
        })
      } catch (err) {
        return userErrorHandler(req, reply, err, {
          action: 'updateSettings',
          ...(req.user?.id && { userId: req.user.id }),
        })
      }
    },
  )
}

export default updateSettingsRoute
