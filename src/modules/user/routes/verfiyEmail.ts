import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import type { Prisma, ActivityType } from '@prisma/client'
import { userErrorHandler } from '../userErrorHandler'

const verifyEmailSchema = z.object({
  token: z.string().optional(),
  code: z.string().optional(),
})

type VerifyEmailInput = z.infer<typeof verifyEmailSchema>

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
  body: unknown
}

const verifyEmailRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/verify-new-Email',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest

      try {
        const parseResult = verifyEmailSchema.safeParse(req.body)
        if (!parseResult.success) throw parseResult.error
        const { token, code }: VerifyEmailInput = parseResult.data

        if (!token && !code) {
          throw {
            statusCode: 400,
            code: 'validationError',
            message: 'Either token or code is required',
            details: [
              { field: 'token|code', message: 'Provide token or code' },
            ],
          }
        }

        // Prefer token if provided
        if (token) {
          // Find user by emailVerificationToken
          const user = await fastify.prisma.user.findFirst({
            where: {
              emailVerificationToken: token,
            },
            select: {
              id: true,
              email: true,
              tokenExpiresAt: true,
              verificationCode: true,
            },
          })

          if (!user) {
            throw {
              statusCode: 400,
              code: 'invalidToken',
              message: 'Invalid verification token',
            }
          }

          if (!user.tokenExpiresAt || new Date() > user.tokenExpiresAt) {
            throw {
              statusCode: 400,
              code: 'tokenExpired',
              message: 'Verification token has expired',
            }
          }

          // Mark email verified and clear verification fields
          await fastify.prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: user.id },
              data: {
                emailVerified: true,
                verificationCode: null,
                emailVerificationToken: null,
                codeExpiresAt: null,
                tokenExpiresAt: null,
                updatedAt: new Date(),
              },
            })

            await tx.userActivityLog.create({
              data: {
                userId: user.id,
                action: 'EMAIL_VERIFICATION' as ActivityType,
                metadata: { method: 'token' } as Prisma.InputJsonValue,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'] ?? null,
              },
            })
          })

          return reply.send({
            success: true,
            message: 'Email verified successfully',
          })
        }

        // Code path: require authentication OR search by code+maybe email
        // Here: prefer authenticated user if present; otherwise find by code (less recommended).
        if (code) {
          // If request has authenticated user, verify code for that user
          if (req.user && req.user.id) {
            const userId = req.user.id
            const user = await fastify.prisma.user.findUnique({
              where: { id: userId },
              select: { id: true, verificationCode: true, codeExpiresAt: true },
            })

            if (!user) {
              throw {
                statusCode: 404,
                code: 'notFoundError',
                message: 'User not found',
              }
            }

            if (!user.verificationCode || user.verificationCode !== code) {
              throw {
                statusCode: 400,
                code: 'invalidCode',
                message: 'Verification code is incorrect',
              }
            }

            if (!user.codeExpiresAt || new Date() > user.codeExpiresAt) {
              throw {
                statusCode: 400,
                code: 'codeExpired',
                message: 'Verification code has expired',
              }
            }

            await fastify.prisma.$transaction(async (tx) => {
              await tx.user.update({
                where: { id: user.id },
                data: {
                  emailVerified: true,
                  verificationCode: null,
                  emailVerificationToken: null,
                  codeExpiresAt: null,
                  tokenExpiresAt: null,
                  updatedAt: new Date(),
                },
              })

              await tx.userActivityLog.create({
                data: {
                  userId: user.id,
                  action: 'EMAIL_VERIFICATION' as ActivityType,
                  metadata: { method: 'code' } as Prisma.InputJsonValue,
                  ipAddress: req.ip,
                  userAgent: req.headers['user-agent'] ?? null,
                },
              })
            })

            return reply.send({
              success: true,
              message: 'Email verified successfully',
            })
          }

 
          const userByCode = await fastify.prisma.user.findFirst({
            where: {
              verificationCode: code,
              codeExpiresAt: { gt: new Date() },
            },
            select: { id: true },
          })

          if (!userByCode) {
            throw {
              statusCode: 400,
              code: 'invalidCode',
              message: 'Verification code is invalid or expired',
            }
          }

          await fastify.prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: userByCode.id },
              data: {
                emailVerified: true,
                verificationCode: null,
                emailVerificationToken: null,
                codeExpiresAt: null,
                tokenExpiresAt: null,
                updatedAt: new Date(),
              },
            })

            await tx.userActivityLog.create({
              data: {
                userId: userByCode.id,
                action: 'EMAIL_VERIFICATION' as ActivityType,
                metadata: { method: 'code' } as Prisma.InputJsonValue,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'] ?? null,
              },
            })
          })

          return reply.send({
            success: true,
            message: 'Email verified successfully',
          })
        }

        // Fallback (should not reach)
        throw {
          statusCode: 400,
          code: 'validationError',
          message: 'Invalid verification request',
        }
      } catch (err) {
        return userErrorHandler(req, reply, err, {
          action: 'verifyEmail',
          ...(req.user?.id && { userId: req.user.id }),
        })
      }
    },
  )
}

export default verifyEmailRoute
