// src/utils/uploadToImageKit.ts
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
 * @param deleteLocal - Whether to delete the local file after upload (default: true)
 * @returns Public URL of the uploaded file.
 */
export async function uploadToImageKit(
  filePath: string,
  fileName: string,
  deleteLocal: boolean = true,
): Promise<string> {
  // Validate environment variables
  if (!process.env.IMAGEKIT_UPLOAD_ENDPOINT) {
    throw new Error('IMAGEKIT_UPLOAD_ENDPOINT environment variable is not set')
  }
  if (!process.env.IMAGEKIT_PRIVATE_KEY) {
    throw new Error('IMAGEKIT_PRIVATE_KEY environment variable is not set')
  }

  // Resolve full path
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath)

  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found at path: ${fullPath}`)
  }

  // Check file size
  const stats = fs.statSync(fullPath)
  if (stats.size === 0) {
    throw new Error('File is empty')
  }

  // Read file
  const fileBuffer = fs.readFileSync(fullPath)
  const mimeType = mime.lookup(fileName) || 'application/octet-stream'

  // Create form data
  const form = new FormData()
  form.append('file', fileBuffer, {
    filename: fileName,
    contentType: mimeType,
  })
  form.append('fileName', fileName)
  form.append('useUniqueFileName', 'true')
  form.append('folder', '/konekta')

  // Create headers
  const headers = {
    ...form.getHeaders(),
    Authorization: `Basic ${Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY}:`).toString('base64')}`,
  }

  try {
    // Upload to ImageKit
    const response = await axios.post(
      process.env.IMAGEKIT_UPLOAD_ENDPOINT,
      form,
      { headers, timeout: 30000 }, // 30 second timeout
    )

    if (!response.data?.url) {
      throw new Error('Invalid response from ImageKit: No URL returned')
    }

    return response.data.url
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('ImageKit upload failed:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      })
      throw new Error(`ImageKit upload failed: ${error.message}`)
    }
    console.error('ImageKit upload failed:', error)
    throw new Error('ImageKit upload failed')
  } finally {
    // Clean up local file
    if (deleteLocal) {
      try {
        await fs.promises.unlink(fullPath)
        console.log('Local file cleaned up:', fullPath)
      } catch (cleanupError) {
        console.warn('Failed to delete local file:', cleanupError)
      }
    }
  }
}
