// src/utils/multipartFieldsToBody.ts
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'

export interface UploadedFileField {
  file: Buffer
  filename: string
  mimetype: string
  fieldname: string
}

/**
 * Parses multipart form data into a structured object and
 * fully consumes file streams to avoid hanging requests.
 *
 * - Files are converted to { file: Buffer, filename, mimetype, fieldname }
 * - Text fields are kept as strings
 *
 * @param req - Fastify request with multipart stream.
 * @returns Object containing fields and files.
 */
export async function multipartFieldsToBody(
  req: FastifyRequest,
): Promise<Record<string, string | UploadedFileField>> {
  const body: Record<string, string | UploadedFileField> = {}

  for await (const part of req.parts()) {
    if (part.type === 'file') {
      // Consume the stream to prevent request from hanging
      const buffer = await part.toBuffer()

      body[part.fieldname] = {
        file: buffer,
        filename: part.filename,
        mimetype: part.mimetype,
        fieldname: part.fieldname,
      }
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
