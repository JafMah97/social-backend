import { prisma } from '../../../plugins/client.js'
import { loginSchema } from '../authSchemas.js'
import { authErrorHandler } from '../authErrorHandler.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in the environment variables.')
}

type LoginInput = z.infer<typeof loginSchema>

const loginRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/login',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const context = { action: 'login', field: 'email' }

      try {
        const result = loginSchema.safeParse(request.body)
        if (!result.success) {
          throw result.error
        }

        const { email, password }: LoginInput = result.data

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            username: true,
            email: true,
            passwordHash: true,
            emailVerified: true,
          },
        })

        if (!user) {
          throw fastify.httpErrors.unauthorized('Invalid email or password.')
        }

        const match = await bcrypt.compare(password, user.passwordHash)
        if (!match) {
          throw fastify.httpErrors.unauthorized('Invalid email or password.')
        }

        if (!user.emailVerified) {
          throw fastify.httpErrors.forbidden('Email not verified.', {
            emailVerified: false,
            action: 'resendVerification',
          })
        }

        const token = jwt.sign(
          { id: user.id, email: user.email, username: user.username },
          JWT_SECRET,
          { expiresIn: '7d' },
        )

        // 🧠 Update last login metadata
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            lastIp: request.ip,
          },
        })

        // 🆕 Create session record
        await prisma.session.create({
          data: {
            userId: user.id,
            token,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days
            ...(request.ip && { ipAddress: request.ip }),
            ...(request.headers['user-agent'] && {
              userAgent: request.headers['user-agent'],
            }),
          },
        })

        return reply
          .setCookie('token', token, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7,
          })
          .send({ id: user.id, username: user.username })
      } catch (err) {
        return authErrorHandler(request, reply, err, context)
      }
    },
  )
}

export default loginRoute
