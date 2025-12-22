import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { userErrorHandler } from '../userErrorHandler'
import type { Prisma, ActivityType } from '@prisma/client'
import { saveUploadedFile } from '../../../utils/saveUploadedFile'
import { uploadToImageKit } from '../../../utils/uploadToImagekit'
import { promises as fsPromises } from 'fs'

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
}

const uploadCoverImageRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/profile-cover',
    {
      preHandler: fastify.authenticate,
      config: {
        bodyLimit: 10 * 1024 * 1024, // 10MB limit
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user.id

      req.log.info({ userId }, 'Upload cover route hit')

      let localPath: string | null = null

      try {
        // Use req.file() to get the uploaded file
        req.log.info('Getting uploaded file via req.file()...')

        const coverImage = await req.file({
          limits: {
            fileSize: 5 * 1024 * 1024, // 5MB max
          },
        })

        if (!coverImage) {
          req.log.warn('No file uploaded')
          throw {
            statusCode: 400,
            code: 'validationError',
            message: 'Cover image is required',
            details: [
              { field: 'coverImage', message: 'Image file is required' },
            ],
          }
        }

        req.log.info(
          {
            filename: coverImage.filename,
            mimetype: coverImage.mimetype,
            fieldname: coverImage.fieldname,
          },
          'Received file',
        )

        // Validate file type
        const mimetype = coverImage.mimetype || ''
        if (!mimetype.startsWith('image/')) {
          req.log.warn({ mimetype }, 'Uploaded file is not an image')
          throw {
            statusCode: 400,
            code: 'validationError',
            message: 'Uploaded file must be an image',
            details: [
              { field: 'coverImage', message: 'Image file is required' },
            ],
          }
        }

        // Save file locally
        req.log.info('Saving file to disk...')
        const saved = await saveUploadedFile(coverImage, 'covers', userId)
        localPath = saved.localPath
        req.log.info(
          { localPath, fileName: saved.fileName },
          'File saved locally',
        )

        // Check file size on disk
        try {
          const stats = await fsPromises.stat(localPath)
          req.log.info({ size: stats.size }, 'Local file size')
        } catch (statErr) {
          req.log.warn({ err: statErr }, 'Could not stat saved file')
        }

        // Upload to ImageKit
        req.log.info('Uploading to ImageKit...')
        const imageUrl = await uploadToImageKit(localPath, saved.fileName)
        req.log.info({ imageUrl }, 'Uploaded to ImageKit')

        // Update database
        req.log.info('Updating user profile...')
        const result = await fastify.prisma.$transaction(async (tx) => {
          // Get previous cover image
          const previous = await tx.user.findUnique({
            where: { id: userId },
            select: { coverImage: true },
          })
          req.log.info(
            { previousCover: previous?.coverImage },
            'Previous cover image',
          )

          // Update user
          const updated = await tx.user.update({
            where: { id: userId },
            data: {
              coverImage: imageUrl,
              updatedAt: new Date(),
            },
            select: {
              coverImage: true,
              updatedAt: true,
              username: true,
            },
          })

          // Create activity log
          await tx.userActivityLog.create({
            data: {
              userId,
              action: 'COVER_PICTURE_CHANGE' as ActivityType,
              metadata: {
                oldImage: previous?.coverImage ?? null,
                newImage: imageUrl,
              } as Prisma.InputJsonValue,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'] ?? null,
            },
          })

          return updated
        })

        req.log.info(
          { userId, username: result.username, imageUrl },
          'Cover image updated successfully',
        )

        return reply.send({
          success: true,
          message: 'Cover image updated successfully',
          data: {
            coverImage: result.coverImage,
            updatedAt: result.updatedAt,
          },
        })
      } catch (err) {
        req.log.error({ err }, 'Error in uploadCoverImageRouteV2')

        // Clean up local file if it exists
        try {
          if (localPath) {
            await fsPromises.unlink(localPath)
            req.log.info('Cleaned up local file')
          }
        } catch (cleanupErr) {
          req.log.warn({ err: cleanupErr }, 'Failed to cleanup uploaded file')
        }

        return userErrorHandler(request, reply, err, {
          action: 'uploadCoverImage',
          userId: req.user?.id || 'unknown',
        })
      }
    },
  )
}

export default uploadCoverImageRoute
