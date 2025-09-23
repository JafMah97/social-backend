import { type FastifyPluginAsync } from 'fastify'
import registerRoute from './routes/register'
// import verifyEmailRoute from './routes/verifyEmail'
// import resendVerificationRoute from './routes/resendVerification'
// import loginRoute from './routes/login'
// import forgotPasswordRoute from './routes/forgotPassword'
// import resetPasswordRoute from './routes/resetPassword'

const authIndex: FastifyPluginAsync = async (fastify) => {
  fastify.register(registerRoute, { prefix: '/auth' })
  // fastify.register(verifyEmailRoute)
  // fastify.register(resendVerificationRoute)
  // fastify.register(loginRoute)
  // fastify.register(forgotPasswordRoute)
  // fastify.register(resetPasswordRoute)
}

export default authIndex
