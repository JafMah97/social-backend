import {
  type FastifyPluginAsync,
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
import fp from 'fastify-plugin'

interface AjvValidationError {
  instancePath: string
  message: string
  params?: {
    missingProperty?: string
  }
}

type FastifyValidationError = FastifyError & {
  validation?: AjvValidationError[]
}

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  // 1. 404 handler for unmatched routes
  fastify.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .type('application/json')
      .send({
        success: false,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: `Route ${request.method}:${request.url} not found.`,
          details: [],
        },
      })
  })

  // 2. Global error handler
  fastify.setErrorHandler(
    (
      error: FastifyValidationError,
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      fastify.log.error(
        { err: error, req: { method: request.method, url: request.url } },
        'Unhandled request error',
      )

      // ✅ AJV schema validation errors (params, query, body)
      if (error.validation) {
        const details = error.validation.map((e) => {
          let field = e.instancePath.replace(/^\//, '').replace(/\//g, '.')

          if (!field && e.params?.missingProperty) {
            field = e.params.missingProperty as string
          }

          if (
            request.params &&
            typeof request.params === 'object' &&
            field in request.params
          ) {
            field = `params.${field}`
          } else if (
            request.query &&
            typeof request.query === 'object' &&
            field in request.query
          ) {
            field = `query.${field}`
          } else if (
            request.body &&
            typeof request.body === 'object' &&
            field in request.body
          ) {
            field = `body.${field}`
          }

          return {
            field,
            message: e.message,
          }
        })

        return reply
          .status(400)
          .type('application/json')
          .send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request payload.',
              details,
            },
          })
      }

      // Malformed JSON or unsupported media type
      if (
        error instanceof SyntaxError ||
        error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE'
      ) {
        return reply
          .status(400)
          .type('application/json')
          .send({
            success: false,
            error: {
              code: 'INVALID_CONTENT_TYPE',
              message: 'Malformed JSON or unsupported content type.',
            },
          })
      }

      // Empty body
      if (error.code === 'FST_ERR_CTP_EMPTY_CONTENT') {
        return reply
          .status(400)
          .type('application/json')
          .send({
            success: false,
            error: {
              code: 'EMPTY_BODY',
              message: 'Empty request body.',
            },
          })
      }

      // Custom HttpErrors
      if (
        typeof error.statusCode === 'number' &&
        error.statusCode >= 400 &&
        error.statusCode < 600
      ) {
        if (error.statusCode === 401 || error.statusCode === 403) {
          reply.clearCookie('token', { path: '/' })
        }
        return reply
          .status(error.statusCode)
          .type('application/json')
          .send({
            success: false,
            error: {
              code: error.code || 'HTTP_ERROR',
              message: error.message,
            },
          })
      }

      // Fallback to sanitized 500
      return reply
        .status(500)
        .type('application/json')
        .send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error.',
            details: [],
          },
        })
    },
  )
}

export default fp(errorHandlerPlugin, { name: 'errorHandlerPlugin' })
