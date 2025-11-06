import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { userErrorHandler } from '../userErrorHandler'
import { deleteUserAndData } from '../../../utils/deleteUserAndData'
interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
}

const deleteAccountRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete(
    '/delete-account',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user.id

      try {
        req.log.info({ userId }, 'Deleting account and all associated data')

        // deleteUserAndData should perform the full deletion and return a summary
        // signature expected: async (userId: string, hardDelete?: boolean) => { deletedCounts: Record<string, number>, duration: number }
        const result = await deleteUserAndData(userId, true)

        // clear authentication cookie/token (adjust name if different)
        try {
          reply.clearCookie('token')
        } catch (e) {
          req.log.warn({ err: e }, 'Failed to clear cookie after delete')
        }

        req.log.info(
          { userId, deleted: result.deletedCounts },
          'Account deleted',
        )

        return reply.status(200).send({
          success: true,
          message: 'Account deleted successfully',
          data: {
            deletedRecords: result.deletedCounts,
            duration: result.duration,
          },
        })
      } catch (err) {
        return userErrorHandler(req, reply, err, {
          action: 'deleteAccount',
          ...(req.user?.id && { userId: req.user.id }),
        })
      }
    },
  )
}

export default deleteAccountRoute
