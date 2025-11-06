import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import jwt from 'jsonwebtoken'
import {
  verifyEmailWithCodeSchema,
  type VerifyEmailWithCodeInput,
} from '../authSchemas'
import { authErrorHandler } from '../authErrorHandler'
import { prisma } from '../../../plugins/client'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in the environment variables.')
}

const verifyEmailWithCode: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/verify-email-with-code',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = verifyEmailWithCodeSchema.safeParse(request.body)
        if (!result.success) {
          throw result.error
        }

        const { email, code }: VerifyEmailWithCodeInput = result.data

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            username: true,
            emailVerified: true,
            verificationCode: true,
            codeExpiresAt: true,
          },
        })

        if (!user) {
          throw {
            statusCode: 400,
            code: 'invalidCredentials',
            message: 'Invalid email or code.',
            details: [
              { field: 'email', message: 'Email not found' },
              { field: 'code', message: 'Code not matched' },
            ],
          }
        }

        if (user.emailVerified) {
          throw {
            statusCode: 409,
            code: 'alreadyVerified',
            message: 'Email is already verified.',
            details: [{ field: 'email', message: 'Already verified' }],
          }
        }

        if (user.verificationCode !== code) {
          throw {
            statusCode: 401,
            code: 'invalidCode',
            message: 'Incorrect verification code.',
            details: [{ field: 'code', message: 'Code does not match' }],
          }
        }

        if (!user.codeExpiresAt || user.codeExpiresAt < new Date()) {
          throw {
            statusCode: 403,
            code: 'expiredCode',
            message: 'Verification code has expired.',
            details: [{ field: 'code', message: 'Expired' }],
          }
        }

        await prisma.user.update({
          where: { email },
          data: {
            emailVerified: true,
            verificationCode: null,
            codeExpiresAt: null,
            emailVerificationToken: null,
            tokenExpiresAt: null,
            lastLoginAt: new Date(),
            lastIp: request.ip,
          },
        })

        const token = jwt.sign(
          { id: user.id, email, username: user.username },
          JWT_SECRET,
          { expiresIn: '7d' },
        )

        await prisma.session.create({
          data: {
            userId: user.id,
            token,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
            ...(request.ip && { ipAddress: request.ip }),
            ...(request.headers['user-agent'] && {
              userAgent: request.headers['user-agent'],
            }),
          },
        })

        request.log.info(
          `[VerifyEmailWithCode] ${email} verified and logged in`,
        )

        return reply
          .setCookie('token', token, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7,
            secure: process.env.NODE_ENV === 'production',
          })
          .send({
            message: 'Email verified and logged in successfully.',
            id: user.id,
            username: user.username,
          })
      } catch (err) {
        return authErrorHandler(request, reply, err, {
          action: 'verify_email_with_code',
          field: 'email or code',
        })
      }
    },
  )
}

export default verifyEmailWithCode
