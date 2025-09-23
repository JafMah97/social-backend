import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { authErrorHandler } from '../authErrorHandler'
import { prisma } from '../../../plugins/client'

const logoutRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    const context = { action: 'logout' }

    try {
      const token = req.cookies?.token

      if (!token) {
        throw fastify.httpErrors.unauthorized(
          'No authentication token found.',
          {
            details: [{ field: 'token', message: 'Missing or expired token' }],
          },
        )
      }

      // 🧹 Delete session from database
      await prisma.session.deleteMany({ where: { token } })

      fastify.log.info('[Logout] Session deleted and token cookie cleared')

      return reply
        .clearCookie('token', {
          path: '/',
          sameSite: 'lax',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
        })
        .send({ message: 'Logged out successfully' })
    } catch (err) {
      return authErrorHandler(req, reply, err, context)
    }
  })
}

export default logoutRoute
