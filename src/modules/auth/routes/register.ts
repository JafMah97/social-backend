// import {
//   type FastifyPluginAsync,
//   type FastifyRequest,
//   type FastifyReply,
// } from 'fastify'
// import { registerSchema } from '../authSchemas'
// import { authErrorHandler } from '../authErrorHandler'
// import { hashPassword } from '../../../utils/hash'
// import { sendVerificationCode } from '../../../utils/mailer'
// import crypto from 'crypto'
// import { prisma } from '../../../plugins/client'
// import { z } from 'zod'

// type RegisterInput = z.infer<typeof registerSchema>

// const registerRoute: FastifyPluginAsync = async (fastify) => {
//   fastify.post(
//     '/register',
//     async (request: FastifyRequest, reply: FastifyReply) => {
//       try {
//         const result = registerSchema.safeParse(request.body)
//         if (!result.success) {
//           throw result.error
//         }

//         const { username, email, password, fullName }: RegisterInput =
//           result.data

//         const userByUsername = await prisma.user.findFirst({
//           where: { username },
//           select: { username: true },
//         })

//         if (userByUsername) {
//           throw {
//             statusCode: 409,
//             code: 'conflictError',
//             message: 'Username already taken',
//             details: [{ field: 'username', message: 'Already exists' }],
//           }
//         }

//         const userByEmail = await prisma.user.findFirst({
//           where: { email },
//           select: { emailVerified: true },
//         })

//         if (userByEmail) {
//           throw {
//             statusCode: 409,
//             code: 'conflictError',
//             message: userByEmail.emailVerified
//               ? 'Email is already verified and registered.'
//               : 'Email exists but not verified.',
//             details: [{ field: 'email', message: 'Already exists' }],
//           }
//         }

//         const verificationCode = Math.floor(
//           100000 + Math.random() * 900000,
//         ).toString()
//         const emailVerificationToken = crypto.randomBytes(32).toString('hex')
//         const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

//         const passwordHash = await hashPassword(password)

//         const newUser = await prisma.user.create({
//           data: {
//             username,
//             email,
//             fullName,
//             passwordHash,
//             emailVerified: false,
//             isPrivate: false,
//             verificationCode,
//             codeExpiresAt: expiresAt,
//             emailVerificationToken,
//             tokenExpiresAt: expiresAt,
//           },
//           select: {
//             id: true,
//             emailVerified: true,
//           },
//         })

//         await prisma.verificationToken.create({
//           data: {
//             userId: newUser.id,
//             token: emailVerificationToken,
//             type: 'EMAIL',
//             expiresAt,
//           },
//         })

//         fastify.log.info(`[Register] Created user: ${email}`)

//         await sendVerificationCode(
//           email,
//           verificationCode,
//           emailVerificationToken,
//         )

//         return reply.status(201).send({
//           message: 'User registered. Check email for verification code/link.',
//           user: {
//             email,
//             username,
//             fullName,
//             emailVerified: newUser.emailVerified,
//           },
//         })
//       } catch (err) {
//         return authErrorHandler(request, reply, err, {
//           action: 'register',
//           field: 'username or email',
//         })
//       }
//     },
//   )
// }

// export default registerRoute


import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { registerSchema } from '../authSchemas'
import { authErrorHandler } from '../authErrorHandler'
import { hashPassword } from '../../../utils/hash'
import { prisma } from '../../../plugins/client'
import { z } from 'zod'
import jwt from 'jsonwebtoken'

type RegisterInput = z.infer<typeof registerSchema>

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in the environment variables.')
}

const registerRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/register',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = registerSchema.safeParse(request.body)
        if (!result.success) {
          throw result.error
        }

        const { username, password, fullName }: RegisterInput = result.data

        // Check username uniqueness
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

        const passwordHash = await hashPassword(password)

        const newUser = await prisma.user.create({
          data: {
            username,
            fullName,
            passwordHash,
            emailVerified: true, // always true now
            isPrivate: false,
            lastLoginAt: new Date(),
            lastIp: request.ip,
          },
          select: { id: true, username: true },
        })

        // Issue JWT immediately
        const token = jwt.sign(
          { id: newUser.id, username: newUser.username },
          JWT_SECRET,
          { expiresIn: '7d' },
        )

        await prisma.session.create({
          data: {
            userId: newUser.id,
            token,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
            ...(request.ip && { ipAddress: request.ip }),
            ...(request.headers['user-agent'] && {
              userAgent: request.headers['user-agent'],
            }),
          },
        })

        // 🌍 Environment-aware cookie config
        const isProd = process.env.NODE_ENV === 'production'

        return reply
          .setCookie('token', token, {
            httpOnly: true,
            secure: isProd, // true in prod (Render HTTPS), false in dev (localhost HTTP)
            sameSite: isProd ? 'none' : 'lax', // 'none' for cross-site prod, 'lax' for local dev
            path: '/',
            maxAge: 60 * 60 * 24 * 7, // 7 days
          })
          .status(201)
          .send({
            message: 'User registered and logged in successfully.',
            id: newUser.id,
            username: newUser.username,
          })
      } catch (err) {
        return authErrorHandler(request, reply, err, {
          action: 'register',
          field: 'username',
        })
      }
    },
  )
}

export default registerRoute
