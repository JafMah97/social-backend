// D:\projects\backend\newSocialBackEnd\src\server.ts
import dotenv from 'dotenv'
dotenv.config()

import { buildApp } from './bootstrap/app.js'
import { logRoutes } from './bootstrap/logger.js'
import { startKeepAlive } from './bootstrap/keepAlive.js'

const start = async () => {
  const app = await buildApp()

  try {
    await app.ready()
    app.log.info('Fastify App ready')

    await app.prisma.$queryRaw`SELECT 1`
    app.log.info('Initial Neon ping sent')

    logRoutes(app)
    startKeepAlive(app)

    const PORT = Number(process.env.PORT) || 3001
    const HOST = process.env.HOST || '0.0.0.0'

    await app.listen({ port: PORT, host: HOST })
    app.log.info(`Server running on http://${HOST}:${PORT}`)
  } catch (err) {
    if (err instanceof Error) {
      app.log.error(err, 'Error during startup')
    } else {
      app.log.error('Error during startup: Unknown error')
    }
    process.exit(1)
  }
}

start()
