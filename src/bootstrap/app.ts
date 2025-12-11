import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import formbody from '@fastify/formbody'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import path from 'path'
import { fileURLToPath } from 'url'

import prismaPlugin from '../plugins/prisma'
import sensiblePlugin from '../plugins/sensible'
import authenticatePlugin from '../plugins/authenticate'
import socketPlugin from '../plugins/websocket'
import errorHandlerPlugin from '../plugins/errorHandler'

import authIndex from '../modules/auth/authIndex'
import postIndex from '../modules/post/postIndex'
import userIndex from '../modules/user/userIndex'
import commentIndex from '../modules/comment/commentIndex'

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
    origin: (origin, cb) => {
      const allowedOrigins = [
        'http://localhost:3000', // dev frontend
        'https://your-frontend.onrender.com', // prod frontend
      ]

      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true)
      } else {
        cb(new Error('Not allowed by CORS'), false)
      }
    },
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

   app.get('/ping', async () => {
     return { status: 'ok' }
   })

  return app
}
