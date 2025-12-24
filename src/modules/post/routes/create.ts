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
import { toPostDTO, type PostDTO } from '../dto/postDTO'

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
        const fields = await multipartFieldsToBody(authenticatedRequest)
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

        if (image && typeof image === 'object' && 'file' in image) {
          if (image.mimetype && !ALLOWED_IMAGE_MIME.includes(image.mimetype)) {
            throw fastify.httpErrors.badRequest('Unsupported image type')
          }

          const { localPath, fileName } = await saveMultipartImage(
            image,
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
          const createdPost = await tx.post.create({
            data: postData,
            include: {
              author: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                  profileImage: true,
                  isPrivate: true,
                },
              },
            },
          })

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

        const dto: PostDTO = toPostDTO(post)

        return reply.status(201).send({
          success: true,
          message: 'Post created successfully.',
          data: { post: dto },
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
