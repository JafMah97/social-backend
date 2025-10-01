//src\utils\saveMultipartImage.ts
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import type { MultipartFile } from '@fastify/multipart'

/**
 * Saves a multipart image file to the local file system.
 *
 * @param data - The uploaded multipart file.
 * @param folder - Subfolder inside `/uploads` (e.g. "avatars", "posts").
 * @param userId - ID of the uploading user, used for filename uniqueness.
 * @returns Object containing the local path and filename.
 */
export async function saveMultipartImage(
  data: MultipartFile,
  folder: string,
  userId: string,
): Promise<{ localPath: string; fileName: string }> {
  const ext = path.extname(data.filename || '') || '.jpg'
  const fileName = `${folder}-${userId}-${Date.now()}${ext}`

  const relativePath = path.join('uploads', folder, fileName)
  const localPath = path.join(process.cwd(), relativePath)

  try {
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true })
    console.log(`📥 Saving image to: ${localPath}`)

    await pipeline(data.file, fs.createWriteStream(localPath))
    console.log(`✅ Image saved: ${fileName}`)

    return { localPath, fileName }
  } catch (err) {
    console.error('❌ Image save failed:', err)
    throw new Error('Failed to save image')
  }
}
