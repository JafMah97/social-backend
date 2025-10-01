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
}

export function formatZodError(
  error: ZodError,
): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'form',
    message: issue.message,
  }))
}

export async function userErrorHandler(
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
      `[User] Fastify HTTP Error: ${fastifyError.message}`,
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

  // 2) Prisma unique constraint error
  if (err instanceof PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join('.')
      req.log.error(
        logContext,
        `[User] Prisma Unique Constraint Error: ${target}`,
      )
      return reply.status(409).send({
        success: false,
        error: {
          code: 'conflictError',
          message: `A user with that ${target} already exists.`,
          details: [{ field: target, message: 'Already exists' }],
        },
      })
    }

    // Handle record not found
    if (err.code === 'P2025') {
      req.log.error(logContext, `[User] Record Not Found Error`)
      return reply.status(404).send({
        success: false,
        error: {
          code: 'notFoundError',
          message: 'User or resource not found.',
          details: [],
        },
      })
    }
  }

  // 3) Zod validation error
  if (err instanceof ZodError) {
    const details = formatZodError(err)
    req.log.error(logContext, `[User] Zod Validation Error`)
    return reply.status(400).send({
      success: false,
      error: {
        code: 'validationError',
        message: 'Invalid request payload.',
        details,
      },
    })
  }

  // 4) Authentication/Authorization errors
  if (err instanceof Error && err.message.includes('Unauthorized')) {
    req.log.error(logContext, `[User] Authorization Error`)
    return reply.status(401).send({
      success: false,
      error: {
        code: 'unauthorizedError',
        message: 'You are not authorized to perform this action.',
        details: [],
      },
    })
  }

  // 5) Image upload errors
  if (err instanceof Error && err.message.includes('upload')) {
    req.log.error(logContext, `[User] Image Upload Error`)
    return reply.status(400).send({
      success: false,
      error: {
        code: 'uploadError',
        message: 'Failed to upload image.',
        details: [{ field: 'image', message: err.message }],
      },
    })
  }

  // 6) Fallback: Internal error
  req.log.error(logContext, `[User] Unhandled Error`)
  return reply.status(500).send({
    success: false,
    error: {
      code: 'internalServerError',
      message: 'An internal error occurred.',
      details: [],
    },
  })
}
