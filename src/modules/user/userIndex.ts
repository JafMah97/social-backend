import type { FastifyPluginAsync } from 'fastify'
import changeEmailRoute from './routes/changeEmail'
import changePasswordRoute from './routes/changePassword'
import completeProfileRoute from './routes/completeProfile'
import deleteAccountRoute from './routes/deleteAccount'
import getMeRoute from './routes/getMe'
import getSettingsRoute from './routes/getSettings'
import uploadCoverImageRoute from './routes/uploadCoverPic'
import uploadProfileImageRoute from './routes/uploadProfilePic'
import updateProfileRoute from './routes/updateProfile'
import updateSettingsRoute from './routes/updateSettings'
import verifyEmailRoute from './routes/verfiyEmail'
import suggestionsRoute from './routes/followersSuggestion'
import followersRoute from './routes/getFollowers'
import getFollowingRoute from './routes/getFollowing'
import getUserByIdRoute from './routes/getUserById'

const userIndex: FastifyPluginAsync = async (fastify) => {
  fastify.register(changeEmailRoute, { prefix: '/user' }) //1
  fastify.register(changePasswordRoute, { prefix: '/user' }) //2
  fastify.register(completeProfileRoute, { prefix: '/user' }) //3
  fastify.register(deleteAccountRoute, { prefix: '/user' }) //4
  fastify.register(getMeRoute, { prefix: '/user' }) //5
  fastify.register(getSettingsRoute, { prefix: '/user' }) //6
  fastify.register(updateProfileRoute, { prefix: '/user' }) //7
  fastify.register(updateSettingsRoute, { prefix: '/user' }) //8
  fastify.register(uploadCoverImageRoute, { prefix: '/user' }) //9
  fastify.register(uploadProfileImageRoute, { prefix: '/user' }) //10
  fastify.register(verifyEmailRoute, { prefix: '/user' }) //11
  fastify.register(suggestionsRoute, { prefix: '/user' }) //12
  fastify.register(followersRoute, { prefix: '/user' }) //13
  fastify.register(getFollowingRoute, { prefix: '/user' }) //14
  fastify.register(getUserByIdRoute, { prefix: '/user' }) //15
}

export default userIndex
