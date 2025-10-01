import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { userErrorHandler } from '../userErrorHandler'
import type { Prisma, ActivityType } from '@prisma/client'
import { saveMultipartImage } from '../../../utils/saveMultipartImage'
import { uploadToImageKit } from '../../../utils/uploadToImagekit'
import { multipartFieldsToBody } from '../../../utils/multipartFieldsToBody'
import { promises as fsPromises } from 'fs'

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
}

type MultipartRequestLike = FastifyRequest & {
  isMultipart?: () => boolean
  multipart?: unknown
}

function hasMultipartSupport(req: FastifyRequest): req is MultipartRequestLike {
  const r = req as unknown as Record<string, unknown>
  return (
    typeof r.isMultipart === 'function' || typeof r.multipart === 'function'
  )
}

const uploadCoverImageRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/profile-cover',
    { preHandler: fastify.authenticate }, // only authenticate at compile-time
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest
      const userId = req.user.id

      // runtime check for multipart plugin
      if (!hasMultipartSupport(request)) {
        return userErrorHandler(
          request,
          reply,
          {
            statusCode: 500,
            code: 'serverError',
            message:
              'Server missing multipart support. Ensure @fastify/multipart is registered (app.register(require("@fastify/multipart"))).',
          },
          { action: 'uploadCoverImage', userId },
        )
      }

      let localPath: string | null = null

      try {
        const body = await multipartFieldsToBody(request)

        const coverImage = body.coverImage
        if (!coverImage || typeof coverImage === 'string') {
          throw {
            statusCode: 400,
            code: 'validationError',
            message: 'Cover image is required',
            details: [
              { field: 'coverImage', message: 'Image file is required' },
            ],
          }
        }

        const saved = await saveMultipartImage(coverImage, 'covers', userId)
        localPath = saved.localPath
        const fileName = saved.fileName

        const imageUrl = await uploadToImageKit(localPath, fileName)

        const result = await fastify.prisma.$transaction(async (tx) => {
          const previous = await tx.user.findUnique({
            where: { id: userId },
            select: { coverImage: true },
          })

          const updated = await tx.user.update({
            where: { id: userId },
            data: {
              coverImage: imageUrl,
              updatedAt: new Date(),
            },
            select: {
              coverImage: true,
              updatedAt: true,
            },
          })

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
          { userId, image: result.coverImage },
          'Cover image updated',
        )

        return reply.send({
          success: true,
          message: 'Cover image updated successfully',
          data: { coverImage: result.coverImage },
        })
      } catch (err) {
        try {
          if (localPath) {
            await fsPromises.unlink(localPath)
          }
        } catch (cleanupErr) {
          req.log?.warn({ err: cleanupErr }, 'Failed to cleanup uploaded file')
        }

        return userErrorHandler(request, reply, err, {
          action: 'uploadCoverImage',
          ...(req.user?.id && { userId: req.user.id }),
        })
      }
    },
  )
}

export default uploadCoverImageRoute
