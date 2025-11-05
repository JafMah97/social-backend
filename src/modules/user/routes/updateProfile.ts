import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { updateProfileSchema } from '../userSchemas.js'
import { userErrorHandler } from '../userErrorHandler.js'
import { z } from 'zod'
import type { Prisma, ActivityType } from '@prisma/client'

type UpdateProfileInput = z.infer<typeof updateProfileSchema>

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
  body: unknown
}

const updateProfileRoute: FastifyPluginAsync = async (fastify) => {
  fastify.put(
    '/profile-update',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user.id

      try {
        const parseResult = updateProfileSchema.safeParse(req.body)
        if (!parseResult.success) throw parseResult.error
        const profileData: UpdateProfileInput = parseResult.data

        // If username is changing, ensure availability
        if (
          typeof profileData.username === 'string' &&
          profileData.username.length > 0
        ) {
          const existing = await fastify.prisma.user.findFirst({
            where: { username: profileData.username, id: { not: userId } },
            select: { id: true },
          })
          if (existing) {
            throw {
              statusCode: 409,
              code: 'conflictError',
              message: 'Username already taken',
              details: [
                { field: 'username', message: 'Username is not available' },
              ],
            }
          }
        }

        // Build a Prisma-safe update payload: include only provided fields
        // replace the "const data: Prisma.UserUpdateInput = { ... }" block with this

        function addSetField<
          T extends Record<string, unknown>,
          K extends string,
          V,
        >(target: T, key: K, value: V | undefined | null, allowNull = false) {
          if (value === undefined) return
          // when allowNull is true we want set: value (value may be null)
          // when allowNull is false we ensure value is non-null and non-undefined
          if (!allowNull && value === null) return
          ;(target as unknown as Record<string, unknown>)[key] = { set: value }
        }

        const data: Prisma.UserUpdateInput = {
          updatedAt: { set: new Date() },
        }

        // strings that must not be null: only set when provided (non-undefined)
        addSetField(data, 'fullName', profileData.fullName)
        addSetField(data, 'username', profileData.username)

        // nullable strings: allow null explicitly (client may send empty => set null)
        addSetField(data, 'bio', profileData.bio ?? null, true)
        addSetField(data, 'website', profileData.website ?? null, true)
        addSetField(data, 'location', profileData.location ?? null, true)

        // dateOfBirth is nullable date: convert when provided, allow null
        addSetField(
          data,
          'dateOfBirth',
          profileData.dateOfBirth ? new Date(profileData.dateOfBirth) : null,
          true,
        )

        // enum / nullable enum
        addSetField(data, 'gender', profileData.gender ?? null, true)

        // boolean (non-nullable) — will be set only when provided (true/false)
        if (typeof profileData.isPrivate === 'boolean') {
          addSetField(data, 'isPrivate', profileData.isPrivate)
        }

        // Perform update inside a transaction with activity log
        const updatedUser = await fastify.prisma.$transaction(async (tx) => {
          const u = await tx.user.update({
            where: { id: userId },
            data,
            select: {
              id: true,
              username: true,
              fullName: true,
              bio: true,
              website: true,
              location: true,
              dateOfBirth: true,
              gender: true,
              isPrivate: true,
              isProfileComplete: true,
              profileImage: true,
              coverImage: true,
              updatedAt: true,
            },
          })

          await tx.userActivityLog.create({
            data: {
              userId,
              action: 'PROFILE_UPDATE' as ActivityType,
              metadata: {
                fields: Object.keys(profileData),
              } as Prisma.InputJsonValue,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'] ?? null,
            },
          })

          return u
        })

        req.log.info({ userId }, 'Profile updated')

        return reply.send({
          success: true,
          message: 'Profile updated successfully',
          data: updatedUser,
        })
      } catch (err) {
        return userErrorHandler(req, reply, err, {
          action: 'updateProfile',
          ...(req.user?.id && { userId: req.user.id }),
        })
      }
    },
  )
}

export default updateProfileRoute
