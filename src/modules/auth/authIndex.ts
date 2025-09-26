import { type FastifyPluginAsync } from 'fastify'
import registerRoute from './routes/register'

import loginRoute from './routes/login'
import logoutRoute from './routes/logout'
import verifyEmailWithCode from './routes/verifyEmailWithCode'
import verifyEmailWithLink from './routes/verifiyEmailWithLink'

const authIndex: FastifyPluginAsync = async (fastify) => {
  fastify.register(registerRoute, { prefix: '/auth' })
  fastify.register(loginRoute, { prefix: '/auth' })
  fastify.register(logoutRoute, { prefix: '/auth' })
  fastify.register(verifyEmailWithCode, { prefix: '/auth' })
  fastify.register(verifyEmailWithLink, { prefix: '/auth' })
}

export default authIndex
