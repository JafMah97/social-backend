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

const uploadProfileImageRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/profile-picture',
    {
      preHandler: fastify.authenticate,
      config: {
        bodyLimit: 10 * 1024 * 1024, // 10MB
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user.id

      req.log.info({ userId }, 'Upload profile picture route hit (v2)')

      let localPath: string | null = null

      try {
        // Get uploaded file
        req.log.info('Getting uploaded file via req.file()...')

        const profileImage = await req.file({
          limits: {
            fileSize: 5 * 1024 * 1024, // 5MB
          },
        })

        if (!profileImage) {
          req.log.warn('No file uploaded')
          throw {
            statusCode: 400,
            code: 'validationError',
            message: 'Profile image is required',
            details: [
              { field: 'profileImage', message: 'Image file is required' },
            ],
          }
        }

        req.log.info(
          {
            filename: profileImage.filename,
            mimetype: profileImage.mimetype,
            fieldname: profileImage.fieldname,
          },
          'Received file',
        )

        // Validate file type
        const mimetype = profileImage.mimetype || ''
        if (!mimetype.startsWith('image/')) {
          req.log.warn({ mimetype }, 'Uploaded file is not an image')
          throw {
            statusCode: 400,
            code: 'validationError',
            message: 'Uploaded file must be an image',
            details: [
              { field: 'profileImage', message: 'Image file is required' },
            ],
          }
        }

        // Save locally
        req.log.info('Saving file to disk...')
        const saved = await saveUploadedFile(profileImage, 'avatars', userId)
        localPath = saved.localPath

        req.log.info(
          { localPath, fileName: saved.fileName },
          'File saved locally',
        )

        // Check file size
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

        // Update DB
        req.log.info('Updating user profile...')
        const result = await fastify.prisma.$transaction(async (tx) => {
          const previous = await tx.user.findUnique({
            where: { id: userId },
            select: { profileImage: true },
          })

          const updated = await tx.user.update({
            where: { id: userId },
            data: {
              profileImage: imageUrl,
              updatedAt: new Date(),
            },
            select: {
              profileImage: true,
              updatedAt: true,
              username: true,
            },
          })

          await tx.userActivityLog.create({
            data: {
              userId,
              action: 'PROFILE_PICTURE_CHANGE' as ActivityType,
              metadata: {
                oldImage: previous?.profileImage ?? null,
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
          'Profile picture updated successfully',
        )

        return reply.send({
          success: true,
          message: 'Profile picture updated successfully',
          data: {
            profileImage: result.profileImage,
            updatedAt: result.updatedAt,
          },
        })
      } catch (err) {
        req.log.error({ err }, 'Error in uploadProfileImageRouteV2')

        // Cleanup
        try {
          if (localPath) {
            await fsPromises.unlink(localPath)
            req.log.info('Cleaned up local file')
          }
        } catch (cleanupErr) {
          req.log.warn({ err: cleanupErr }, 'Failed to cleanup uploaded file')
        }

        return userErrorHandler(request, reply, err, {
          action: 'uploadProfilePic',
          userId: req.user?.id || 'unknown',
        })
      }
    },
  )
}

export default uploadProfileImageRoute
