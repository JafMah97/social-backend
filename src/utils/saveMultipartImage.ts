// src/utils/saveMultipartImage.ts
import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import type { UploadedFileField } from './multipartFieldsToBody'

/**
 * Saves a parsed multipart image (Buffer-based) to the local file system.
 *
 * @param data - Parsed file object { file: Buffer, filename, mimetype, fieldname }
 * @param folder - Subfolder inside `/uploads` (e.g. "avatars", "posts").
 * @param userId - ID of the uploading user, used for filename uniqueness.
 * @returns Object containing the local path and filename.
 */
export async function saveMultipartImage(
  data: UploadedFileField,
  folder: string,
  userId: string | number,
): Promise<{ localPath: string; fileName: string }> {
  const ext = path.extname(data.filename || '') || '.jpg'
  const fileName = `${folder}-${userId}-${randomUUID()}${ext}`

  const relativePath = path.join('uploads', folder, fileName)
  const localPath = path.join(process.cwd(), relativePath)

  try {
    await fs.mkdir(path.dirname(localPath), { recursive: true })
    console.log(`📥 Saving image to: ${localPath}`)

    // Write the buffer directly (stream already consumed in multipartFieldsToBody)
    await fs.writeFile(localPath, data.file)
    console.log(`✅ Image saved: ${fileName}`)

    return { localPath, fileName }
  } catch (err) {
    console.error('❌ Image save failed:', err)
    throw new Error('Failed to save image')
  }
}
