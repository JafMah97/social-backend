//D:\projects\backend\newSocialBackEnd\src\utils\seed.ts
import chalk from 'chalk'
import boxen from 'boxen'
import { prisma } from '../plugins/client'
import { hashPassword } from './hash'

async function main() {
  const email = 'testuser@example.com'
  const username = 'testuser'
  const password = 'password123'
  const fullName = 'Test User'

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    const message = chalk.yellow(
      `User already exists: ${email}\nSkipping seed.`,
    )
    console.log(
      boxen(message, {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
      }),
    )
    return
  }

  const passwordHash = await hashPassword(password)

  const user = await prisma.user.create({
    data: {
      email,
      username,
      fullName,
      passwordHash,
      emailVerified: true,
      isPrivate: false,
    },
  })

  const message = chalk.green(
    `Seeded user:\nEmail: ${user.email}\nUsername: ${username}\nPassword: ${password}`,
  )
  console.log(
    boxen(message, {
      padding: 1,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'green',
    }),
  )
}

main()
  .catch((err) => {
    const errorMsg = chalk.red(`Seed failed:\n${err}`)
    console.error(
      boxen(errorMsg, {
        padding: 1,
        margin: 1,
        borderStyle: 'classic',
        borderColor: 'red',
      }),
    )
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
