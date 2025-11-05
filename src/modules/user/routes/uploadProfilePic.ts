import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { userErrorHandler } from '../userErrorHandler.js'
import type { Prisma, ActivityType } from '@prisma/client'
import { multipartFieldsToBody } from '../../../utils/multipartFieldsToBody.js'
import { saveMultipartImage } from '../../../utils/saveMultipartImage.js'
import { uploadToImageKit } from '../../../utils/uploadToImagekit.js'
import { promises as fsPromises } from 'fs'

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
}

function hasMultipartSupport(req: FastifyRequest) {
  const r = req as unknown as Record<string, unknown>
  return (
    typeof r.isMultipart === 'function' || typeof r.multipart === 'function'
  )
}

const uploadProfileImageRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/profile-picture',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user.id

      // ensure multipart plugin is registered at runtime
      if (!hasMultipartSupport(request)) {
        return userErrorHandler(
          request,
          reply,
          {
            statusCode: 500,
            code: 'serverError',
            message:
              'Server missing multipart support. Ensure @fastify/multipart is registered.',
          },
          { action: 'uploadProfilePic', userId },
        )
      }

      let localPath: string | null = null

      try {
        const body = await multipartFieldsToBody(request)

        const profileImage = body.profileImage
        if (!profileImage || typeof profileImage === 'string') {
          throw {
            statusCode: 400,
            code: 'validationError',
            message: 'Profile image is required',
            details: [
              { field: 'profileImage', message: 'Image file is required' },
            ],
          }
        }

        const saved = await saveMultipartImage(profileImage, 'avatars', userId)
        localPath = saved.localPath
        const fileName = saved.fileName

        const imageUrl = await uploadToImageKit(localPath, fileName)

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
          { userId, image: result.profileImage },
          'Profile image updated',
        )

        return reply.send({
          success: true,
          message: 'Profile picture updated successfully',
          data: { profileImage: result.profileImage },
        })
      } catch (err) {
        try {
          if (localPath) await fsPromises.unlink(localPath)
        } catch (cleanupErr) {
          req.log?.warn({ err: cleanupErr }, 'Failed to cleanup uploaded file')
        }

        return userErrorHandler(request, reply, err, {
          action: 'uploadProfilePic',
          ...(req.user?.id && { userId: req.user.id }),
        })
      }
    },
  )
}

export default uploadProfileImageRoute
