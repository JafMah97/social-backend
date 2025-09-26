import { type FastifyPluginAsync } from 'fastify'
import registerRoute from './routes/register'

import loginRoute from './routes/login'
import logoutRoute from './routes/logout'
import verifyEmailWithCode from './routes/verifyEmailWithCode'
import verifyEmailWithLink from './routes/verifiyEmailWithLink'
import resendVerification from './routes/resendVerificationEmail'
import forgotPassword from './routes/forgotPassword'
import resetPassword from './routes/resetPassword'

const authIndex: FastifyPluginAsync = async (fastify) => {
  fastify.register(registerRoute, { prefix: '/auth' })
  fastify.register(loginRoute, { prefix: '/auth' })
  fastify.register(logoutRoute, { prefix: '/auth' })
  fastify.register(verifyEmailWithCode, { prefix: '/auth' })
  fastify.register(verifyEmailWithLink, { prefix: '/auth' })
  fastify.register(resendVerification, { prefix: '/auth' })
  fastify.register(forgotPassword, { prefix: '/auth' })
  fastify.register(resetPassword, { prefix: '/auth' })
}

export default authIndex
