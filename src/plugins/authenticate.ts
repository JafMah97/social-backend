/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
import fp from 'fastify-plugin'
import { type FastifyPluginAsync } from 'fastify'
import jwt from 'jsonwebtoken'
import chalk from 'chalk'

interface JwtPayload {
  id: string
  iat: number
  exp: number
}

interface RequestUser {
  id: string
  email: string
  username: string
  profileImage: string | null
  fullName: string | null
  isPrivate: boolean
  iat: number
  exp: number
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: RequestUser
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void>
    authenticateOptional: (
      req: FastifyRequest,
      rep: FastifyReply,
    ) => Promise<void>
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_backup'

const authenticate: FastifyPluginAsync = async (fastify) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fastify.decorate('authenticate', async (req, rep) => {
    const token = req.cookies?.token
    if (!token) {
      throw fastify.httpErrors.unauthorized('Authentication token missing')
    }

    let payload: JwtPayload
    try {
      payload = jwt.verify(token, JWT_SECRET) as JwtPayload
    } catch (err) {
      req.log.warn(
        chalk.yellow(`Token verification failed: ${(err as Error).message}`),
      )
      throw fastify.httpErrors.unauthorized('Token is invalid or expired')
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        email: true,
        username: true,
        profileImage: true,
        fullName: true,
        isPrivate: true,
      },
    })

    if (!user) {
      throw fastify.httpErrors.unauthorized('User does not exist')
    }

    req.user = { ...user, iat: payload.iat, exp: payload.exp }

    req.log.info(chalk.green(`Authenticated user ${user.username}`))
  })

  fastify.decorate('authenticateOptional', async (req, rep) => {
    try {
      await fastify.authenticate(req, rep)
    } catch {
      // Silent fallback for guest access
    }
  })

  fastify.log.info(chalk.cyan('JWT authentication plugin registered'))
}

export default fp(authenticate, { name: 'authenticate' })
