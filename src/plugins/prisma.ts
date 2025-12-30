import fp from 'fastify-plugin'
import { type FastifyPluginAsync, type FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import chalk from 'chalk'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1500

/**
 * Attempts to connect to the database with retry logic.
 * (Supabase is stable, so this is mostly defensive.)
 */
async function connectWithRetry(
  prisma: PrismaClient,
  fastify: FastifyInstance,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await prisma.$connect()
      fastify.log.info(
        chalk.green(`Connected to Supabase (attempt ${attempt})`),
      )
      return true
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      fastify.log.warn(
        chalk.yellow(`Supabase connect attempt ${attempt} failed: ${message}`),
      )

      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) =>
          globalThis.setTimeout(resolve, RETRY_DELAY_MS),
        )
      }
    }
  }

  return false
}

/**
 * Fastify Prisma plugin with retry and graceful shutdown.
 */
const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.log.info(chalk.cyan('Initializing Prisma with Supabase...'))

  const prisma = new PrismaClient()
  const connected = await connectWithRetry(prisma, fastify)

  if (!connected) {
    fastify.log.error(
      chalk.red(`Could not connect to Supabase after ${MAX_RETRIES} attempts.`),
    )
  }

  fastify.decorate('prisma', prisma)

  fastify.addHook('onClose', async () => {
    try {
      await prisma.$disconnect()
      fastify.log.info(chalk.blue('Disconnected from Supabase'))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      fastify.log.error(chalk.red(`Error disconnecting Prisma: ${message}`))
    }
  })
}

export default fp(prismaPlugin, { name: 'prismaPlugin' })
