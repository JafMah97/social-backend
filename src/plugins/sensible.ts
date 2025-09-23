import fp from 'fastify-plugin'
import sensible from '@fastify/sensible'
import chalk from 'chalk'

export default fp(async (fastify) => {
  fastify.register(sensible)
  fastify.log.info(chalk.cyan('Fastify Sensible registered'))
})
