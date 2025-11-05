import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import bcrypt from 'bcrypt'
import { prisma } from '../../../plugins/client.js'
import { authErrorHandler } from '../authErrorHandler.js'
import { resetPasswordSchema, type ResetPasswordInput } from '../authSchemas.js'

const resetPasswordRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/reset-password',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = resetPasswordSchema.safeParse(request.body)
        if (!result.success) {
          throw result.error
        }

        const { token, newPassword }: ResetPasswordInput = result.data

        const user = await prisma.user.findFirst({
          where: {
            resetPasswordToken: token,
            resetPasswordTokenExpiresAt: { gt: new Date() },
          },
          select: { id: true },
        })

        if (!user) {
          throw {
            statusCode: 401,
            code: 'invalidToken',
            message: 'Password reset token is invalid or has expired.',
            details: [{ field: 'token', message: 'Invalid or expired token' }],
          }
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10)

        await prisma.user.update({
          where: { id: user.id },
          data: {
            passwordHash: hashedPassword,
            resetPasswordToken: null,
            resetPasswordTokenExpiresAt: null,
          },
        })

        fastify.log.info(
          `[ResetPassword] User ${user.id} password has been reset`,
        )

        return reply.send({
          message: 'Password has been reset successfully.',
        })
      } catch (err) {
        return authErrorHandler(request, reply, err, {
          action: 'reset_password',
          field: 'token or password',
        })
      }
    },
  )
}

export default resetPasswordRoute
