import { type FastifyPluginAsync } from 'fastify'
import createPostRoute from './routes/create.js'
import updatePostRoute from './routes/update.js'
import deletePostRoute from './routes/delete.js'
import getPostRoute from './routes/get.js'
import listPostsRoute from './routes/list.js'
import likePostRoute from './routes/like.js'
import savePostRoute from './routes/save.js'
import unlikePostRoute from './routes/unlike.js'
import unsavePostRoute from './routes/unsave.js'
import getSavedPostsRoute from './routes/saved.js'

const postIndex: FastifyPluginAsync = async (fastify) => {
  fastify.register(createPostRoute, { prefix: '/posts' })
  fastify.register(updatePostRoute, { prefix: '/posts' })
  fastify.register(deletePostRoute, { prefix: '/posts' })
  fastify.register(getPostRoute, { prefix: '/posts' })
  fastify.register(getSavedPostsRoute, { prefix: '/posts' })
  fastify.register(listPostsRoute, { prefix: '/posts' })
  fastify.register(likePostRoute, { prefix: '/posts' })
  fastify.register(unlikePostRoute, { prefix: '/posts' })
  fastify.register(savePostRoute, { prefix: '/posts' })
  fastify.register(unsavePostRoute, { prefix: '/posts' })
}

export default postIndex
