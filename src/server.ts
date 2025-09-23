// D:\projects\backend\newSocialBackEnd\src\server.ts
import dotenv from 'dotenv'
dotenv.config()

import { buildApp } from './bootStrap/app'
import { showBanner, spinner } from './utils/cli'
import { logRoutes } from './bootStrap/logger'
import { startKeepAlive } from './bootStrap/keepAlive'

const PORT = parseInt(process.env.PORT || '3000', 10)
const HOST = process.env.HOST || '0.0.0.0'

const start = async () => {
  showBanner()
  spinner.start()

  const app = await buildApp()

  try {
    await app.ready()
    app.log.info('Fastify App ready')

    await app.prisma.$queryRaw`SELECT 1`
    app.log.info('Initial Neon ping sent')

    logRoutes(app)

    const address = await app.listen({ port: PORT, host: HOST })
    spinner.succeed(` Server is live at ${address}`)

    startKeepAlive(app)
  } catch (err) {
    spinner.fail('Server failed to start')
    if (err instanceof Error) {
      app.log.error(err, 'Error during startup')
    } else {
      app.log.error('Error during startup: Unknown error')
    }
    process.exit(1)
  }
}

start()
