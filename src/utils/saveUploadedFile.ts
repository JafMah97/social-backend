// src/utils/saveUploadedFile.ts
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import type { MultipartFile } from '@fastify/multipart'

/**
 * Saves an uploaded file from req.file() to the local file system.
 *
 * @param file - The uploaded multipart file from req.file()
 * @param folder - Subfolder inside `/uploads` (e.g. "avatars", "posts").
 * @param userId - ID of the uploading user, used for filename uniqueness.
 * @returns Object containing the local path and filename.
 */
export async function saveUploadedFile(
  file: MultipartFile,
  folder: string,
  userId: string,
): Promise<{ localPath: string; fileName: string }> {
  const ext = path.extname(file.filename || '') || '.jpg'
  const fileName = `${folder}-${userId}-${Date.now()}${ext}`

  const uploadsDir = path.join(process.cwd(), 'uploads', folder)
  const localPath = path.join(uploadsDir, fileName)

  try {
    // Create directory if it doesn't exist
    await fs.promises.mkdir(uploadsDir, { recursive: true })

    // Save the file
    await pipeline(file.file, fs.createWriteStream(localPath))

    return { localPath, fileName }
  } catch (err) {
    console.error('File save failed:', err)
    throw new Error('Failed to save file')
  }
}
