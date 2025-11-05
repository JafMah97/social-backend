import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../../../plugins/client.js'
import { authErrorHandler } from '../authErrorHandler.js'
import { deleteUserAndData } from '../../../utils/deleteUserAndData.js'

const deleteAccountSchema = z.object({
  password: z.string().min(1, { message: 'Password is required' }),
})

type DeleteAccountInput = z.infer<typeof deleteAccountSchema>

const deleteAccountRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete(
    '/delete',
    {
      preHandler: fastify.authenticate,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user?.id) {
        throw {
          statusCode: 401,
          code: 'unauthenticated',
          message: 'Authentication required.',
          details: [{ field: 'user', message: 'Missing user context' }],
        }
      }

      const userId = request?.user?.id

      try {
        const result = deleteAccountSchema.safeParse(request.body)
        if (!result.success) {
          throw result.error
        }

        const { password }: DeleteAccountInput = result.data

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { passwordHash: true },
        })

        if (!user) {
          throw {
            statusCode: 404,
            code: 'userNotFound',
            message: 'User record not found.',
            details: [{ field: 'id', message: 'No user with this ID' }],
          }
        }

        const match = await bcrypt.compare(password, user.passwordHash)
        if (!match) {
          throw {
            statusCode: 401,
            code: 'invalidPassword',
            message: 'Invalid password.',
            details: [
              { field: 'password', message: 'Password does not match' },
            ],
          }
        }

        await deleteUserAndData(userId)
        fastify.log.info(`[DeleteAccount] Removed user ${userId} and all data`)

        return reply
          .clearCookie('token', {
            path: '/',
            sameSite: 'lax',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
          })
          .send({ message: 'Account and all data deleted.' })
      } catch (err) {
        return authErrorHandler(request, reply, err, {
          action: 'delete_account',
          userId,
        })
      }
    },
  )
}

export default deleteAccountRoute
