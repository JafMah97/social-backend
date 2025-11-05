import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import crypto from 'crypto'
import { prisma } from '../../../plugins/client.js'
import { sendPasswordResetLink } from '../../../utils/mailer.js'
import { authErrorHandler } from '../authErrorHandler.js'
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from '../authSchemas.js'

const forgotPasswordRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/forgot-password',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = forgotPasswordSchema.safeParse(request.body)
        if (!result.success) {
          throw result.error
        }

        const { email }: ForgotPasswordInput = result.data

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true },
        })

        // Always respond generically to prevent email enumeration
        if (user) {
          const resetToken = crypto.randomBytes(32).toString('hex')
          const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

          await prisma.user.update({
            where: { id: user.id },
            data: {
              resetPasswordToken: resetToken,
              resetPasswordTokenExpiresAt: resetTokenExpiresAt,
            },
          })

          await sendPasswordResetLink(user.email, resetToken)
          fastify.log.info(`[ForgotPassword] Sent reset link to ${user.email}`)
        } else {
          fastify.log.info(
            `[ForgotPassword] Attempted reset for non-existent email: ${email}`,
          )
        }

        return reply.send({
          message:
            'If a user with that email exists, a password reset link has been sent.',
        })
      } catch (err) {
        return authErrorHandler(request, reply, err, {
          action: 'request_password_reset',
          field: 'email',
        })
      }
    },
  )
}

export default forgotPasswordRoute
