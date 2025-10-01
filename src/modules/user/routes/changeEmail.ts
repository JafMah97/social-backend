import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import { changeEmailSchema } from '../userSchemas'
import { userErrorHandler } from '../userErrorHandler'
import { comparePassword } from '../../../utils/hash'
import { sendVerificationCode } from '../../../utils/mailer'
import type { Prisma } from '@prisma/client'
import crypto from 'crypto'


type ChangeEmailInput = z.infer<typeof changeEmailSchema>

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
  body: unknown
}

const changeEmailRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/change-email',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user.id
      try {
        const parseResult = changeEmailSchema.safeParse(req.body)
        if (!parseResult.success) throw parseResult.error
        const { newEmail, password }: ChangeEmailInput = parseResult.data

        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, passwordHash: true },
        })

        if (!user) {
          throw {
            statusCode: 404,
            code: 'notFoundError',
            message: 'User not found',
          }
        }

        const isPasswordValid = await comparePassword(
          password,
          user.passwordHash,
        )
        if (!isPasswordValid) {
          throw {
            statusCode: 400,
            code: 'validationError',
            message: 'Password is incorrect',
            details: [{ field: 'password', message: 'Incorrect password' }],
          }
        }

        const existingUser = await fastify.prisma.user.findFirst({
          where: { email: newEmail, id: { not: userId } },
          select: { id: true },
        })

        if (existingUser) {
          throw {
            statusCode: 409,
            code: 'conflictError',
            message: 'Email already in use',
            details: [
              { field: 'newEmail', message: 'Email is already registered' },
            ],
          }
        }

        // Generate verification code and token
        const verificationCode = Math.floor(
          100000 + Math.random() * 900000,
        ).toString()

        const emailVerificationToken = crypto.randomBytes(32).toString('hex')

        const codeExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

        // Use transaction to update email and log activity atomically
        await fastify.prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: userId },
            data: {
              email: newEmail,
              emailVerified: false,
              verificationCode,
              emailVerificationToken,
              codeExpiresAt,
              tokenExpiresAt,
              updatedAt: new Date(),
            },
          })

          await tx.userActivityLog.create({
            data: {
              userId,
              action: 'EMAIL_VERIFICATION',
              metadata: {
                oldEmail: user.email,
                newEmail,
              } as Prisma.InputJsonValue,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'] ?? null,
            },
          })
        })

        // Send verification email to new email
        await sendVerificationCode(
          newEmail,
          verificationCode,
          emailVerificationToken,
        )

        return reply.send({
          success: true,
          message:
            'Email changed successfully. Please verify your new email address.',
          data: {
            email: newEmail,
            verificationSent: true,
          },
        })
      } catch (err) {
        return userErrorHandler(req, reply, err, {
          action: 'changeEmail',
          ...(req.user?.id && { userId: req.user.id }),
        })
      }
    },
  )
}

export default changeEmailRoute
