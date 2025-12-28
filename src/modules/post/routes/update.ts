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
        const fields = await multipartFieldsToBody(authenticatedRequest)

        const result = updatePostSchema.safeParse({
          ...fields,
          postId: rawPostId,
        })
        if (!result.success) throw result.error

        const { postId, ...updateData }: UpdatePostInput = result.data

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

        if (updateData.image !== undefined) {
          if (
            updateData.image &&
            typeof updateData.image === 'object' &&
            'file' in updateData.image
          ) {
            const file = updateData.image as UploadedFileField
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
          } else if (typeof updateData.image === 'string') {
            imageUrl = updateData.image
          } else if (updateData.image === null) {
            imageUrl = null
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

        return reply.send({
          success: true,
          message: 'Post updated successfully.',
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

export default updatePostRoute
