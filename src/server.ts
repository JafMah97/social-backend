// D:\projects\backend\newSocialBackEnd\src\server.ts
import dotenv from 'dotenv'
dotenv.config()

import { buildApp } from './bootstrap/app'
import { logRoutes } from './bootstrap/logger'
// import { startKeepAlive } from './bootstrap/keepAlive' // Not needed for Supabase

const start = async () => {
  const app = await buildApp()

  try {
    await app.ready()
    app.log.info('Fastify App ready')

    // Optional: simple DB ping (works fine with Supabase, but not required)
    // await app.prisma.$queryRaw`SELECT 1`
    // app.log.info('Initial DB ping sent')

    logRoutes(app)

    const PORT = Number(process.env.PORT)
    await app.listen({ port: PORT, host: '0.0.0.0' })

    const NODE_ENV = process.env.NODE_ENV
    const baseUrl =
      NODE_ENV === 'production'
        ? `https://${process.env.RAILWAY_STATIC_URL} https://${process.env.RENDER_STATIC_URL}`
        : `http://localhost:${PORT}`

    app.log.info(`Server running at ${baseUrl}`)
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
