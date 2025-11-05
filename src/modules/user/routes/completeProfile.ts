import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { completeProfileSchema } from '../userSchemas.js'
import { userErrorHandler } from '../userErrorHandler.js'
import type { Prisma, ActivityType } from '@prisma/client'

type CompleteProfileInput = z.infer<typeof completeProfileSchema>

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
  body: unknown
}

const completeProfileRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/complete-profile',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user.id

      try {
        const parseResult = completeProfileSchema.safeParse(req.body)
        if (!parseResult.success) throw parseResult.error
        const profileData: CompleteProfileInput = parseResult.data

        // Build Prisma-safe update payload: include only fields provided by the client.
        const userUpdatePayload: Prisma.UserUpdateInput = {
          isProfileComplete: { set: true },
          updatedAt: { set: new Date() },
          // Each optional field is conditionally spread and wrapped with { set: ... }
          ...(Object.prototype.hasOwnProperty.call(profileData, 'bio') && {
            bio: { set: profileData.bio ?? null },
          }),
          ...(Object.prototype.hasOwnProperty.call(profileData, 'website') && {
            website: { set: profileData.website ?? null },
          }),
          ...(Object.prototype.hasOwnProperty.call(profileData, 'location') && {
            location: { set: profileData.location ?? null },
          }),
          ...(Object.prototype.hasOwnProperty.call(profileData, 'gender') && {
            gender: { set: profileData.gender ?? null },
          }),
          ...(Object.prototype.hasOwnProperty.call(
            profileData,
            'dateOfBirth',
          ) && {
            dateOfBirth: {
              set: profileData.dateOfBirth
                ? new Date(profileData.dateOfBirth)
                : null,
            },
          }),
        }

        const updatedUser = await fastify.prisma.$transaction(async (tx) => {
          const u = await tx.user.update({
            where: { id: userId },
            data: userUpdatePayload,
            select: {
              id: true,
              username: true,
              fullName: true,
              bio: true,
              website: true,
              location: true,
              dateOfBirth: true,
              gender: true,
              isProfileComplete: true,
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

        req.log.info({ userId }, 'Profile completed')

        return reply.send({
          success: true,
          message: 'Profile completed successfully',
          data: updatedUser,
        })
      } catch (err) {
        return userErrorHandler(req, reply, err, {
          action: 'completeProfile',
          ...(req.user?.id && { userId: req.user.id }),
        })
      }
    },
  )
}

export default completeProfileRoute
