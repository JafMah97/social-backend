//src\bootStrap\keepAlive.ts
import { type FastifyInstance } from 'fastify'
export function startKeepAlive(app: FastifyInstance) {
  globalThis.setInterval(
    async () => {
      try {
        await app.prisma.$queryRaw`SELECT 1`
        app.log.info('Keep-alive ping sent to Neon')
      } catch (err) {
        app.log.error(`Neon keep-alive ping failed: ${(err as Error).message}`)
      }
    },
    5 * 60 * 1000,
  )
}
