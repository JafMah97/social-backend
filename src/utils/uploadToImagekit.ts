import axios from 'axios'
import fs from 'fs'
import path from 'path'
import FormData from 'form-data'
import mime from 'mime-types'
import { Buffer } from 'node:buffer'

/**
 * Uploads a local file to ImageKit CDN and returns its public URL.
 *
 * @param filePath - Local path to the file.
 * @param fileName - Desired filename on ImageKit.
 * @returns Public URL of the uploaded file.
 */
export async function uploadToImageKit(
  filePath: string,
  fileName: string,
): Promise<string> {
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath)

  if (
    !process.env.IMAGEKIT_UPLOAD_ENDPOINT ||
    !process.env.IMAGEKIT_PRIVATE_KEY
  ) {
    throw new Error('Missing ImageKit credentials')
  }

  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found at path: ${fullPath}`)
  }

  const fileBuffer = fs.readFileSync(fullPath)
  const mimeType = mime.lookup(fileName) || 'application/octet-stream'

  const form = new FormData()
  form.append('file', fileBuffer, {
    filename: fileName,
    contentType: mimeType,
  })
  form.append('fileName', fileName)
  form.append('useUniqueFileName', 'true')
  form.append('folder', '/konekta')

  const headers = {
    ...form.getHeaders(),
    Authorization: `Basic ${Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY}:`).toString('base64')}`,
  }

  try {
    const res = await axios.post(process.env.IMAGEKIT_UPLOAD_ENDPOINT, form, {
      headers,
    })

    if (!res.data?.url || typeof res.data.url !== 'string') {
      throw new Error('Invalid ImageKit response')
    }

    return res.data.url
  } catch (err: unknown) {
    const errorDetails = axios.isAxiosError(err)
      ? err.response?.data || err.message
      : err

    console.error('[uploadToImageKit] Failed:', errorDetails)
    throw new Error('Image upload failed')
  } finally {
    try {
      await fs.promises.rm(fullPath, { force: true })
      console.log('✅ Temporary file deleted:', fullPath)
    } catch (cleanupErr) {
      console.error('❌ Cleanup failed:', cleanupErr)
    }
  }
}
