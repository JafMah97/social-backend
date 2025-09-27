import { type FastifyPluginAsync } from 'fastify'
import createPostRoute from './routes/create'
import updatePostRoute from './routes/update'
import deletePostRoute from './routes/delete'
import getPostRoute from './routes/get'
import listPostsRoute from './routes/list'
import likePostRoute from './routes/like'
import savePostRoute from './routes/save'
import unlikePostRoute from './routes/unlike'
import unsavePostRoute from './routes/unsave'
import getSavedPostsRoute from './routes/saved.ts'


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
