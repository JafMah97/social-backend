// src/modules/posts/routes/createPostRoute.ts
import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import fs from 'fs/promises'
import { createPostSchema } from '../postSchemas'
import { postErrorHandler } from '../postErrorHandler'
import { multipartFieldsToBody } from '../../../utils/multipartFieldsToBody'
import { saveMultipartImage } from '../../../utils/saveMultipartImage'
import { uploadToImageKit } from '../../../utils/uploadToImagekit'
import type { Prisma } from '@prisma/client'

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
}

type CreatePostInput = z.infer<typeof createPostSchema>

const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp']

const createPostRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/create',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        throw fastify.httpErrors.unauthorized('Authentication required')
      }

      const authenticatedRequest = request as AuthenticatedRequest
      const context = {
        action: 'create_post',
        userId: authenticatedRequest.user.id,
      }

      let imageUrl: string | null = null
      let tempFilePath: string | null = null

      try {
        // Parse multipart form into structured object
        const fields = await multipartFieldsToBody(authenticatedRequest)

        // Validate against schema
        const result = createPostSchema.safeParse(fields)
        if (!result.success) throw result.error

        const {
          title,
          content,
          image,
          format,
          postType,
          visibility,
          startsAt,
          endsAt,
        }: CreatePostInput = result.data

        // Handle image upload
        if (image && typeof image === 'object' && 'file' in image) {
          if (image.mimetype && !ALLOWED_IMAGE_MIME.includes(image.mimetype)) {
            throw fastify.httpErrors.badRequest('Unsupported image type')
          }

          const { localPath, fileName } = await saveMultipartImage(
            image, // now matches UploadedFileField structure
            'posts',
            authenticatedRequest.user.id,
          )
          tempFilePath = localPath
          imageUrl = await uploadToImageKit(localPath, fileName)
        } else if (typeof image === 'string') {
          imageUrl = image
        }

        const postData = {
          title: title || null,
          content: content || null,
          image: imageUrl,
          format: format || 'TEXT',
          postType: postType || 'STANDARD',
          visibility: visibility || 'PUBLIC',
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
          authorId: authenticatedRequest.user.id,
        }

        const post = await fastify.prisma.$transaction(async (tx) => {
          const createdPost = await tx.post.create({ data: postData })

          await tx.userActivityLog.create({
            data: {
              userId: authenticatedRequest.user.id,
              action: 'POST_CREATE',
              metadata: { postId: createdPost.id } as Prisma.InputJsonValue,
              ipAddress: authenticatedRequest.ip,
              userAgent: authenticatedRequest.headers['user-agent'] ?? null,
            },
          })

          return createdPost
        })

        fastify.log.info(`[Post] Created post: ${post.id}`)

        return reply.status(201).send({
          success: true,
          data: { post },
        })
      } catch (err) {
        return postErrorHandler(authenticatedRequest, reply, err, context)
      } finally {
        if (tempFilePath) {
          await fs
            .unlink(tempFilePath)
            .catch((err) =>
              fastify.log.warn(
                { err },
                'Failed to delete temporary image file.',
              ),
            )
        }
      }
    },
  )
}

export default createPostRoute
