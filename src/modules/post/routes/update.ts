import {
  type FastifyPluginAsync,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'
import fs from 'fs/promises'
import { updatePostSchema } from '../postSchemas'
import { postErrorHandler } from '../postErrorHandler'
import {
  multipartFieldsToBody,
  type UploadedFileField,
} from '../../../utils/multipartFieldsToBody'
import { saveMultipartImage } from '../../../utils/saveMultipartImage'
import { uploadToImageKit } from '../../../utils/uploadToImagekit'
import type { Prisma, ActivityType } from '@prisma/client'
import { toPostDTO, type PostDTO } from '../dto/postDTO'

interface RequestParams {
  postId: string
}

interface AuthenticatedRequest extends FastifyRequest {
  user: NonNullable<FastifyRequest['user']>
  params: RequestParams
}

type UpdatePostInput = z.infer<typeof updatePostSchema>

const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp']

const updatePostRoute: FastifyPluginAsync = async (fastify) => {
  fastify.put(
    '/update/:postId',
    { preHandler: fastify.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        throw fastify.httpErrors.unauthorized('Authentication required')
      }

      const authenticatedRequest = request as AuthenticatedRequest
      const { postId: rawPostId } = authenticatedRequest.params
      const context = {
        action: 'update_post',
        userId: authenticatedRequest.user.id,
        postId: rawPostId,
      }

      let imageUrl: string | null | undefined = undefined
      let tempFilePath: string | null = null

      try {
        // ✅ Dual-mode: parse multipart if multipart, otherwise use JSON body
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fields : any
        if (request.isMultipart()) {
          fields = await multipartFieldsToBody(authenticatedRequest)
          fastify.log.info({ fields }, '[UpdatePost] Parsed multipart fields')
        } else {
          fields = request.body
          fastify.log.info({ fields }, '[UpdatePost] Parsed JSON body')
        }

        const result = updatePostSchema.safeParse({
          ...fields,
          postId: rawPostId,
        })
        if (!result.success) throw result.error

        const { postId, ...updateData }: UpdatePostInput = result.data
        fastify.log.info(
          { updateData },
          '[UpdatePost] Incoming updateData after schema parse',
        )

        const existingPost = await fastify.prisma.post.findFirst({
          where: {
            id: postId,
            authorId: authenticatedRequest.user.id,
            isDeleted: false,
          },
        })

        if (!existingPost) {
          throw {
            statusCode: 404,
            code: 'postNotFound',
            message: 'Post not found or you do not have permission to edit it.',
          }
        }

        // ✅ Handle image cases
        if (updateData.image !== undefined) {
          let rawImage = updateData.image

          // Normalize string "null" to actual null
          if (rawImage === 'null') {
            rawImage = null
          }

          fastify.log.info(
            { imageField: rawImage },
            '[UpdatePost] Raw image field',
          )

          if (rawImage && typeof rawImage === 'object' && 'file' in rawImage) {
            const file = rawImage as UploadedFileField
            if (file.mimetype && !ALLOWED_IMAGE_MIME.includes(file.mimetype)) {
              throw fastify.httpErrors.badRequest('Unsupported image type')
            }
            const { localPath, fileName } = await saveMultipartImage(
              file,
              'posts',
              authenticatedRequest.user.id,
            )
            tempFilePath = localPath
            imageUrl = await uploadToImageKit(localPath, fileName)
            fastify.log.info(
              { uploadedUrl: imageUrl },
              '[UpdatePost] Uploaded new image',
            )
          } else if (typeof rawImage === 'string') {
            imageUrl = rawImage
            fastify.log.info(
              { imageUrl },
              '[UpdatePost] Using provided image string',
            )
          } else if (rawImage === null) {
            imageUrl = null
            fastify.log.info('[UpdatePost] Explicitly clearing image (null)')
          }
        }

        const postUpdatePayload: Prisma.PostUpdateInput = {
          updatedAt: new Date(),
          ...(updateData.title !== undefined && { title: updateData.title }),
          ...(updateData.content !== undefined && {
            content: updateData.content,
          }),
          ...(imageUrl !== undefined && { image: imageUrl }),
          ...(updateData.format !== undefined && { format: updateData.format }),
          ...(updateData.postType !== undefined && {
            postType: updateData.postType,
          }),
          ...(updateData.visibility !== undefined && {
            visibility: updateData.visibility,
          }),
          ...(updateData.startsAt !== undefined && {
            startsAt: updateData.startsAt
              ? new Date(updateData.startsAt)
              : null,
          }),
          ...(updateData.endsAt !== undefined && {
            endsAt: updateData.endsAt ? new Date(updateData.endsAt) : null,
          }),
        }

        fastify.log.info(
          { postUpdatePayload },
          '[UpdatePost] Final Prisma update payload',
        )

        const post = await fastify.prisma.$transaction(async (tx) => {
          const updatedPost = await tx.post.update({
            where: { id: postId },
            data: postUpdatePayload,
            include: {
              tags: { include: { tag: true } },
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

          fastify.log.info(
            { updatedPost },
            '[UpdatePost] Post after update transaction',
          )

          await tx.userActivityLog.create({
            data: {
              userId: authenticatedRequest.user.id,
              action: 'POST_UPDATE' as ActivityType,
              metadata: { postId: updatedPost.id } as Prisma.InputJsonValue,
              ipAddress: authenticatedRequest.ip,
              userAgent: authenticatedRequest.headers['user-agent'] ?? null,
            },
          })

          return updatedPost
        })

        fastify.log.info(`[Post] Updated post: ${post.id}`)

        const isLiked = !!(await fastify.prisma.postLike.findFirst({
          where: {
            postId: post.id,
            userId: authenticatedRequest.user.id,
            isRemoved: false,
          },
        }))

        const isSaved = !!(await fastify.prisma.savedPost.findFirst({
          where: {
            postId: post.id,
            userId: authenticatedRequest.user.id,
            isRemoved: false,
          },
        }))

        const dto: PostDTO = toPostDTO(post, {
          tags: post.tags.map((t) => t.tag.name),
          isLiked,
          isSaved,
        })

        fastify.log.info({ dto }, '[UpdatePost] Returning DTO')

        return reply.send({
          success: true,
          message: 'Post updated successfully.',
          data: { post: dto },
        })
      } catch (err) {
        fastify.log.error({ err }, '[UpdatePost] Error caught')
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

export default updatePostRoute
