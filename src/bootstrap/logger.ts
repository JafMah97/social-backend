//src\bootStrap\logger.ts
import { type FastifyInstance } from 'fastify'
import chalk from 'chalk'
import boxen from 'boxen'

export function logRoutes(app: FastifyInstance) {
  const raw = app.printRoutes({ commonPrefix: false })
  const routes: string[] = raw.split('\n').filter((r) => r.trim() !== '')
  app.log.info(chalk.cyan(`Total Routes: ${routes.length}`))

  // // log each route line individually for easier scanning in logs
  // for (const line of routes) {
  //   app.log.info(line.trim())
  // }

  const routeGroups: Record<string, string[]> = {}
  for (const route of routes) {
    const match = route.match(/(\/\w+)/)
    const prefix = match?.[1] ?? 'misc'
    if (!routeGroups[prefix]) routeGroups[prefix] = []
    routeGroups[prefix].push(route)
  }

  const prefixIcons: Record<string, string> = {
    '/ws': '📡 WS',
    '/auth': '🔐 Auth',
    '/user': '👤 User',
    '/posts': '📝 Posts',
    '/comments': '💬 Comments',
    '/follow': '👥 Follow',
    '/notifications': '📬 Notify',
    '/stories': '📖 Stories',
    '/messages': '✉️ Msg',
    '/uploads': '📂 Uploads',
    '/': '🏠 Root',
    misc: '📦 Misc',
  }

  const lines: string[] = []

  for (const prefix in routeGroups) {
    const icon = prefixIcons[prefix] || ` ${prefix}`
    const count = routeGroups[prefix]?.length ?? 0
    lines.push(
      `${chalk.green(icon.padEnd(10))} → ${chalk.yellow(prefix)} (${chalk.magenta(count)})`,
    )
  }

  const boxed = boxen(lines.join('\n'), {
    title: chalk.bold.blue('📚 Route Summary'),
    titleAlignment: 'center',
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'green',
  })

  console.log(boxed)
}
