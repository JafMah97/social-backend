// D:\projects\backend\newSocialBackEnd\src\server.ts
import dotenv from 'dotenv'
dotenv.config()

import { buildApp } from './bootstrap/app'
import { logRoutes } from './bootstrap/logger'
import { startKeepAlive } from './bootstrap/keepAlive'

const start = async () => {
  const app = await buildApp()

  try {
    await app.ready()
    app.log.info('✅ Fastify App ready')

    // Simple DB ping
    await app.prisma.$queryRaw`SELECT 1`
    app.log.info('✅ Initial Neon ping sent')

    logRoutes(app)
    startKeepAlive(app)

    // Railway provides PORT automatically
    const PORT = Number(process.env.PORT)
    // Always bind to 0.0.0.0 so Railway can route traffic
    const HOST = '0.0.0.0'

    await app.listen({ port: PORT, host: HOST })

    // Log the correct URL depending on environment
    const NODE_ENV = process.env.NODE_ENV 
    const baseUrl =
      NODE_ENV === 'production'
        ? `https://${process.env.RAILWAY_STATIC_URL}`
        : `http://localhost:${PORT}`

    app.log.info(`🚀 Server running at ${baseUrl}`)
  } catch (err) {
    if (err instanceof Error) {
      app.log.error(err, '❌ Error during startup')
    } else {
      app.log.error('❌ Error during startup: Unknown error')
    }
    process.exit(1)
  }
}

start()
