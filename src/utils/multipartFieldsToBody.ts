import type { FastifyRequest } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { z } from 'zod'

/**
 * Parses multipart form data into a structured object.
 *
 * @param req - Fastify request with multipart stream.
 * @returns Object containing fields and files.
 */
export async function multipartFieldsToBody(
  req: FastifyRequest,
): Promise<Record<string, string | MultipartFile>> {
  const body: Record<string, string | MultipartFile> = {}

  for await (const part of req.parts()) {
    if (part.type === 'file') {
      body[part.fieldname] = part
    } else {
      body[part.fieldname] = part.value as string
    }
  }

  return body
}

/**
 * Validates parsed multipart body against a Zod schema.
 *
 * @param data - Parsed multipart body.
 * @param schema - Zod schema to validate against.
 * @returns Validated data.
 */
export function validateMultipart<T>(data: unknown, schema: z.ZodType<T>): T {
  return schema.parse(data)
}
