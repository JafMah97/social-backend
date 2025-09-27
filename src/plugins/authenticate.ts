// authenticate.ts
import fp from 'fastify-plugin'
import { type FastifyPluginAsync } from 'fastify'
import jwt from 'jsonwebtoken'
import chalk from 'chalk'

interface JwtPayload {
  id: string
  iat: number
  exp: number
}

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_backup'

const authenticate: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (req) => {
    const token =
      req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')

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
        isProfileComplete: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        isActive: true,
      },
    })

    if (!user) {
      throw fastify.httpErrors.unauthorized('User does not exist')
    }

    // Create the user object with JWT payload
    req.user = {
      ...user,
      iat: payload.iat,
      exp: payload.exp,
    }

    req.log.info(chalk.green(`Authenticated user ${user.username}`))
  })

  fastify.decorate('authenticateOptional', async (req, rep) => {
    try {
      await fastify.authenticate(req, rep)
    } catch {
      // Silent fallback for guest access
      req.user = undefined
    }
  })

  fastify.log.info(chalk.cyan('JWT authentication plugin registered'))
}

export default fp(authenticate, { name: 'authenticate' })
