import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import crypto from 'crypto'
import { prisma } from '../../../plugins/client.js'
import { sendVerificationCode } from '../../../utils/mailer.js'
import { authErrorHandler } from '../authErrorHandler.js'
import {
  resendVerificationSchema,
  type ResendVerificationInput,
} from '../authSchemas.js'

const resendVerificationEmailRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/resend-verification',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = resendVerificationSchema.safeParse(request.body)
        if (!result.success) {
          throw result.error
        }

        const { email }: ResendVerificationInput = result.data

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            emailVerified: true,
          },
        })

        if (!user) {
          throw {
            statusCode: 404,
            code: 'userNotFound',
            message: 'User not found.',
            details: [
              { field: 'email', message: 'No account with this email' },
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

        const verificationCode = Math.floor(
          100000 + Math.random() * 900000,
        ).toString()
        const emailVerificationToken = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

        await prisma.user.update({
          where: { email },
          data: {
            verificationCode,
            codeExpiresAt: expiresAt,
            emailVerificationToken,
            tokenExpiresAt: expiresAt,
          },
        })

        await prisma.verificationToken.create({
          data: {
            userId: user.id,
            token: emailVerificationToken,
            type: 'EMAIL',
            expiresAt,
          },
        })

        await sendVerificationCode(
          email,
          verificationCode,
          emailVerificationToken,
        )

        fastify.log.info(`[ResendVerification] Sent code to ${email}`)

        return reply.send({
          message: 'Verification code resent successfully.',
        })
      } catch (err) {
        return authErrorHandler(request, reply, err, {
          action: 'resend_verification_email',
          field: 'email',
        })
      }
    },
  )
}

export default resendVerificationEmailRoute
