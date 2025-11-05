import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { registerSchema } from '../authSchemas.js'
import { authErrorHandler } from '../authErrorHandler.js'
import { hashPassword } from '../../../utils/hash.js'
import { sendVerificationCode } from '../../../utils/mailer.js'
import crypto from 'crypto'
import { prisma } from '../../../plugins/client.js'
import { z } from 'zod'

type RegisterInput = z.infer<typeof registerSchema>

const registerRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/register',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = registerSchema.safeParse(request.body)
        if (!result.success) {
          throw result.error
        }

        const { username, email, password, fullName }: RegisterInput =
          result.data

        const userByUsername = await prisma.user.findFirst({
          where: { username },
          select: { username: true },
        })

        if (userByUsername) {
          throw {
            statusCode: 409,
            code: 'conflictError',
            message: 'Username already taken',
            details: [{ field: 'username', message: 'Already exists' }],
          }
        }

        const userByEmail = await prisma.user.findFirst({
          where: { email },
          select: { emailVerified: true },
        })

        if (userByEmail) {
          throw {
            statusCode: 409,
            code: 'conflictError',
            message: userByEmail.emailVerified
              ? 'Email is already verified and registered.'
              : 'Email exists but not verified.',
            details: [{ field: 'email', message: 'Already exists' }],
          }
        }

        const verificationCode = Math.floor(
          100000 + Math.random() * 900000,
        ).toString()
        const emailVerificationToken = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

        const passwordHash = await hashPassword(password)

        const newUser = await prisma.user.create({
          data: {
            username,
            email,
            fullName,
            passwordHash,
            emailVerified: false,
            isPrivate: false,
            verificationCode,
            codeExpiresAt: expiresAt,
            emailVerificationToken,
            tokenExpiresAt: expiresAt,
          },
          select: {
            id: true,
            emailVerified: true,
          },
        })

        await prisma.verificationToken.create({
          data: {
            userId: newUser.id,
            token: emailVerificationToken,
            type: 'EMAIL',
            expiresAt,
          },
        })

        fastify.log.info(`[Register] Created user: ${email}`)

        await sendVerificationCode(
          email,
          verificationCode,
          emailVerificationToken,
        )

        return reply.status(201).send({
          message: 'User registered. Check email for verification code/link.',
          user: {
            email,
            username,
            fullName,
            emailVerified: newUser.emailVerified,
          },
        })
      } catch (err) {
        return authErrorHandler(request, reply, err, {
          action: 'register',
          field: 'username or email',
        })
      }
    },
  )
}

export default registerRoute
