import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { changePasswordSchema } from '../userSchemas'
import { userErrorHandler } from '../userErrorHandler'
import { comparePassword, hashPassword } from '../../../utils/hash'
import type { Prisma, ActivityType } from '@prisma/client'

type ChangePasswordInput = z.infer<typeof changePasswordSchema>

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
  body: unknown
}

const changePasswordRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/change-password',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user.id

      try {
        const result = changePasswordSchema.safeParse(req.body)
        if (!result.success) throw result.error

        const { currentPassword, newPassword }: ChangePasswordInput =
          result.data

        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, passwordHash: true },
        })

        if (!user) {
          throw {
            statusCode: 404,
            code: 'notFoundError',
            message: 'User not found',
          }
        }

        const isCurrentPasswordValid = await comparePassword(
          currentPassword,
          user.passwordHash,
        )
        if (!isCurrentPasswordValid) {
          throw {
            statusCode: 400,
            code: 'validationError',
            message: 'Current password is incorrect',
            details: [
              { field: 'currentPassword', message: 'Incorrect password' },
            ],
          }
        }

        const newPasswordHash = await hashPassword(newPassword)

        await fastify.prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: userId },
            data: {
              passwordHash: newPasswordHash,
              updatedAt: new Date(),
            },
          })

          await tx.userActivityLog.create({
            data: {
              userId,
              action: 'PASSWORD_CHANGE' as ActivityType,
              metadata: {
                changedAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'] ?? null,
            },
          })
        })

        req.log.info({ userId }, 'Password changed')

        return reply.send({
          success: true,
          message: 'Password changed successfully',
        })
      } catch (err) {
        return userErrorHandler(req, reply, err, {
          action: 'changePassword',
          ...(req.user?.id && { userId: req.user.id }),
        })
      }
    },
  )
}

export default changePasswordRoute
