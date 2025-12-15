/* eslint-disable no-unused-vars */
import fp from 'fastify-plugin'
import { Server, Socket } from 'socket.io'
import { type FastifyInstance } from 'fastify'
import chalk from 'chalk'

declare module 'fastify' {
  interface FastifyInstance {
    io: Server
    socketClients: Map<string, Socket>
    sendNotification: (userId: string, payload: object) => void
  }
}

export default fp(async (fastify: FastifyInstance) => {
  // Decide which origin to allow based on NODE_ENV
  const NODE_ENV = process.env.NODE_ENV || 'development'
  const allowedOrigin =
    NODE_ENV === 'production'
      ? process.env.PROD_ORIGIN
      : process.env.DEV_ORIGIN || 'http://localhost:3000'

  const io = new Server(fastify.server, {
    cors: {
      origin: allowedOrigin,
      methods: ['GET', 'POST'],
    },
  })

  fastify.decorate('io', io)
  fastify.decorate('socketClients', new Map<string, Socket>())

  fastify.decorate('sendNotification', (userId: string, payload: object) => {
    const socket = fastify.socketClients.get(userId)
    if (socket) {
      try {
        socket.emit('notification', payload)
        fastify.log.info(chalk.green(`Notification sent to user ${userId}`))
      } catch (error) {
        fastify.log.error(
          { userId, error },
          chalk.red('Failed to send Socket.IO notification'),
        )
      }
    } else {
      fastify.log.warn(
        { userId },
        chalk.yellow('User not connected via Socket.IO'),
      )
    }
  })

  io.on('connection', (socket: Socket) => {
    const userId = socket.handshake.query.userId as string

    if (!userId?.trim()) {
      socket.disconnect(true)
      return
    }

    fastify.socketClients.set(userId, socket)

    fastify.log.info(
      chalk.green(`Socket.IO connection opened for user ${userId}`),
    )

    socket.on('disconnect', () => {
      fastify.socketClients.delete(userId)
      fastify.log.info(
        chalk.blue(`Socket.IO connection closed for user ${userId}`),
      )
    })
  })

  fastify.log.info(chalk.cyan('Socket.IO plugin registered'))
})
