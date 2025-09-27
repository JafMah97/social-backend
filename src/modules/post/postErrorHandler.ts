import {
  type FastifyReply,
  type FastifyRequest,
  type FastifyError,
} from 'fastify'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { ZodError } from 'zod'

interface FastifyErrorWithDetails extends FastifyError {
  details?: Array<{ field: string; message: string }>
}

export interface ErrorContext {
  action: string
  field?: string
  metadata?: Record<string, unknown>
  userId?: string
  postId?: string
}

export function formatZodError(
  error: ZodError,
): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'form',
    message: issue.message,
  }))
}

export async function postErrorHandler(
  req: FastifyRequest,
  reply: FastifyReply,
  err: unknown,
  context: ErrorContext,
): Promise<FastifyReply> {
  const logContext = { ...context, err }

  // 1) Fastify HTTP errors
  const fastifyError = err as FastifyErrorWithDetails
  if (fastifyError.statusCode) {
    req.log.error(
      logContext,
      `[Post] Fastify HTTP Error: ${fastifyError.message}`,
    )
    return reply.status(fastifyError.statusCode).send({
      success: false,
      error: {
        code: fastifyError.code,
        message: fastifyError.message,
        details: fastifyError.details ?? [],
      },
    })
  }

  // 2) Prisma errors
  if (err instanceof PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // Unique constraint
        { const target = (err.meta?.target as string[])?.join('.')
        req.log.error(
          logContext,
          `[Post] Prisma Unique Constraint Error: ${target}`,
        )
        return reply.status(409).send({
          success: false,
          error: {
            code: 'conflictError',
            message: `Post conflict: ${target} already exists.`,
            details: [{ field: target, message: 'Already exists' }],
          },
        }) }
      case 'P2025': // Record not found
        req.log.error(logContext, `[Post] Prisma Record Not Found`)
        return reply.status(404).send({
          success: false,
          error: {
            code: 'notFound',
            message: 'Post not found.',
            details: [],
          },
        })
      default:
        req.log.error(logContext, `[Post] Prisma Error: ${err.code}`)
        return reply.status(400).send({
          success: false,
          error: {
            code: 'databaseError',
            message: 'Database operation failed.',
            details: [],
          },
        })
    }
  }

  // 3) Zod validation error
  if (err instanceof ZodError) {
    const details = formatZodError(err)
    req.log.error(logContext, `[Post] Zod Validation Error`)
    return reply.status(400).send({
      success: false,
      error: {
        code: 'validationError',
        message: 'Invalid request payload.',
        details,
      },
    })
  }

  // 4) Fallback: Internal error
  req.log.error(logContext, `[Post] Unhandled Error`)
  return reply.status(500).send({
    success: false,
    error: {
      code: 'internalServerError',
      message: 'An internal error occurred.',
      details: [],
    },
  })
}
