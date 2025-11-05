import { type FastifyPluginAsync } from 'fastify'
import createCommentRoute from './routes/create'
import deleteCommentRoute from './routes/delete'
import editCommentRoute from './routes/edit'
import getCommentsByPostIdRoute from './routes/getCommentsByPostId'
import likeCommentRoute from './routes/like'
import unlikeCommentRoute from './routes/unlike'

const commentIndex: FastifyPluginAsync = async (fastify) => {
  fastify.register(createCommentRoute, { prefix: '/comments' })
  fastify.register(editCommentRoute, { prefix: '/comments' })
  fastify.register(deleteCommentRoute, { prefix: '/comments' })
  fastify.register(getCommentsByPostIdRoute, { prefix: '/comments' })
  fastify.register(likeCommentRoute, { prefix: '/comments' })
  fastify.register(unlikeCommentRoute, { prefix: '/comments' })
}

export default commentIndex
