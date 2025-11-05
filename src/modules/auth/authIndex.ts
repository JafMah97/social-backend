import { type FastifyPluginAsync } from 'fastify'
import registerRoute from './routes/register.js'

import loginRoute from './routes/login.js'
import logoutRoute from './routes/logout.js'
import verifyEmailWithCode from './routes/verifyEmailWithCode.js'
import verifyEmailWithLink from './routes/verifiyEmailWithLink.js'
import resendVerification from './routes/resendVerificationEmail.js'
import forgotPassword from './routes/forgotPassword.js'
import resetPassword from './routes/resetPassword.js'

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
