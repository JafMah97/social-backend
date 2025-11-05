import { type FastifyPluginAsync } from 'fastify'
import createCommentRoute from './routes/create.js'
import deleteCommentRoute from './routes/delete.js'
import editCommentRoute from './routes/edit.js'
import getCommentsByPostIdRoute from './routes/getCommentsByPostId.js'
import likeCommentRoute from './routes/like.js'
import unlikeCommentRoute from './routes/unlike.js'

const commentIndex: FastifyPluginAsync = async (fastify) => {
  fastify.register(createCommentRoute, { prefix: '/comments' })
  fastify.register(editCommentRoute, { prefix: '/comments' })
  fastify.register(deleteCommentRoute, { prefix: '/comments' })
  fastify.register(getCommentsByPostIdRoute, { prefix: '/comments' })
  fastify.register(likeCommentRoute, { prefix: '/comments' })
  fastify.register(unlikeCommentRoute, { prefix: '/comments' })
}

export default commentIndex
