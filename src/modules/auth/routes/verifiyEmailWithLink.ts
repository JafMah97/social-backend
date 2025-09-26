import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import jwt from 'jsonwebtoken'
import {
  verifyEmailWithLinkSchema,
  type VerifyEmailWithLinkInput,
} from '../authSchemas'
import { authErrorHandler } from '../authErrorHandler'
import { prisma } from '../../../plugins/client'
import type { User } from '@prisma/client'
import type { Prisma } from '@prisma/client'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in the environment variables.')
}

const verifyEmailWithLink: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/verify-email-with-link',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = verifyEmailWithLinkSchema.safeParse(request.body)
        if (!result.success) {
          throw result.error
        }

        const { token }: VerifyEmailWithLinkInput = result.data

        fastify.log.info(`[VerifyEmailWithLink] Verifying token: ${token}`)

        // Prefer VerificationToken table as source of truth
        const verificationToken = await prisma.verificationToken.findFirst({
          where: {
            token,
            type: 'EMAIL',
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                emailVerified: true,
              },
            },
          },
        })

        // Fallback to legacy token stored on User row
        if (!verificationToken) {
          const userByToken = await prisma.user.findFirst({
            where: {
              emailVerificationToken: token,
              tokenExpiresAt: { gt: new Date() },
            },
            select: {
              id: true,
              email: true,
              username: true,
              emailVerified: true,
            },
          })

          if (!userByToken) {
            fastify.log.warn(
              `[VerifyEmailWithLink] Token not found or expired: ${token}`,
            )
            throw {
              statusCode: 400,
              code: 'invalidToken',
              message: 'Invalid or expired verification token.',
              details: [
                { field: 'token', message: 'Token not found or expired' },
              ],
            }
          }

          if (userByToken.emailVerified) {
            throw {
              statusCode: 409,
              code: 'alreadyVerified',
              message: 'Email is already verified.',
              details: [{ field: 'email', message: 'Already verified' }],
            }
          }

          await verifyUserEmail(userByToken.id, request.ip)

          const jwtToken = await createSession(
            userByToken.id,
            userByToken.email,
            userByToken.username,
            request,
          )

          fastify.log.info(
            `[VerifyEmailWithLink] ${userByToken.email} verified via user table token`,
          )

          return sendSuccessResponse(reply, jwtToken, userByToken)
        }

        const user = verificationToken.user as User

        if (user.emailVerified) {
          throw {
            statusCode: 409,
            code: 'alreadyVerified',
            message: 'Email is already verified.',
            details: [{ field: 'email', message: 'Already verified' }],
          }
        }

        await verifyUserEmail(user.id, request.ip)

        // Mark token used for audit
        await prisma.verificationToken.update({
          where: { id: verificationToken.id },
          data: { usedAt: new Date() },
        })

        const jwtToken = await createSession(
          user.id,
          user.email,
          user.username,
          request,
        )

        fastify.log.info(
          `[VerifyEmailWithLink] ${user.email} verified via verification token table`,
        )

        return sendSuccessResponse(reply, jwtToken, user)
      } catch (err) {
        return authErrorHandler(request, reply, err, {
          action: 'verify_email_with_link',
          field: 'token',
        })
      }
    },
  )
}

async function verifyUserEmail(userId: string, ip: string | undefined) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      tokenExpiresAt: null,
      verificationCode: null,
      codeExpiresAt: null,
      lastLoginAt: new Date(),
      lastIp: ip,
    } as Prisma.UserUpdateInput,
  })
}

async function createSession(
  userId: string,
  email: string,
  username: string,
  request: FastifyRequest,
) {
  const jwtToken = jwt.sign({ id: userId, email, username }, JWT_SECRET!, {
    expiresIn: '7d',
  })

  await prisma.session.create({
    data: {
      userId,
      token: jwtToken,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      ...(request.ip && { ipAddress: request.ip }),
      ...(request.headers['user-agent'] && {
        userAgent: request.headers['user-agent'] as string,
      }),
    },
  })

  return jwtToken
}

function sendSuccessResponse(
  reply: FastifyReply,
  jwtToken: string,
  user: { id: string; email: string; username: string },
) {
  return reply
    .setCookie('token', jwtToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === 'production',
    })
    .send({
      message: 'Email verified and logged in successfully.',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    })
}

export default verifyEmailWithLink
