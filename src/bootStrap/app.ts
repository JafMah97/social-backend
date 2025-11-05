import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import formbody from '@fastify/formbody'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import path from 'path'
import { fileURLToPath } from 'url'

import prismaPlugin from '../plugins/prisma.js'
import sensiblePlugin from '../plugins/sensible.js'
import authenticatePlugin from '../plugins/authenticate.js'
import socketPlugin from '../plugins/websocket.js'
import errorHandlerPlugin from '../plugins/errorHandler.js'

import authIndex from '../modules/auth/authIndex.js'
import postIndex from '../modules/post/postIndex.js'
import userIndex from '../modules/user/userIndex.js'
import commentIndex from '../modules/comment/commentIndex.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function buildApp() {
  const app = Fastify({
    pluginTimeout: 60000,
    logger:
      process.env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                levelFirst: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
              },
            },
          }
        : true,
  })

  await app.register(cors, {
    origin: process.env.BASE_URL_FRONTEND || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    credentials: true,
  })

  app.register(sensiblePlugin)
  app.register(cookie, { secret: process.env.COOKIE_SECRET || 'dev_secret' })
  app.register(formbody)
  app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 },
    attachFieldsToBody: false,
  })
  app.register(fastifyStatic, {
    root: path.join(__dirname, '..', '..', 'uploads'),
    prefix: '/uploads/',
  })
  app.register(prismaPlugin)
  app.register(authenticatePlugin)
  app.register(socketPlugin)
  app.register(errorHandlerPlugin)

  app.register(authIndex)
  app.register(postIndex)
  app.register(userIndex)
  app.register(commentIndex)

  return app
}
