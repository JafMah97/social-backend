// src/utils/processUploadedFile.ts
import type { MultipartFile } from '@fastify/multipart'

/**
 * Validates and processes an uploaded file.
 *
 * @param file - The uploaded file from req.file()
 * @param allowedMimeTypes - Array of allowed MIME types (e.g., ['image/jpeg', 'image/png'])
 * @param maxSize - Maximum file size in bytes
 * @returns The validated file
 */
export function validateUploadedFile(
  file: MultipartFile,
  allowedMimeTypes: string[] = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ],
): MultipartFile {
  // Check if file exists
  if (!file) {
    throw {
      statusCode: 400,
      code: 'validationError',
      message: 'No file uploaded',
    }
  }

  // Check file type
  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw {
      statusCode: 400,
      code: 'validationError',
      message: `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`,
    }
  }

  // Note: File size is usually validated by the multipart plugin config,
  // but you could add additional validation here if needed

  return file
}
