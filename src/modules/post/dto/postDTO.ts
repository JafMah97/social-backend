// src/modules/posts/dto/postDTO.ts
import type { Post, Prisma } from '@prisma/client'

/**
 * Prisma type for Post with author included (only selected fields).
 */
export type PostWithAuthor = Prisma.PostGetPayload<{
  include: {
    author: {
      select: {
        id: true
        username: true
        fullName: true
        profileImage: true
        isPrivate: true
      }
    }
  }
}>

/**
 * Author snapshot returned in DTO.
 */
export interface PostAuthorDTO {
  id: string
  username: string
  fullName: string
  profileImage: string
  isPrivate: boolean
}

/**
 * Canonical Post DTO shape used by all endpoints.
 */
export interface PostDTO {
  id: string
  author: PostAuthorDTO
  title: string | null
  content: string | null
  image: string | null
  format: Post['format']
  postType: Post['postType']
  visibility: Post['visibility']
  tags: string[]
  createdAt: string
  updatedAt: string
  likesCount: number
  commentsCount: number
  viewsCount: number
  isLiked: boolean
  isSaved: boolean
  isSponsored: boolean
}

/**
 * Mapper: converts Prisma PostWithAuthor into PostDTO.
 * Accepts optional overrides for isLiked and isSaved.
 */
export const toPostDTO = (
  post: PostWithAuthor,
  opts?: { isLiked?: boolean; isSaved?: boolean; tags?: string[] },
): PostDTO => ({
  id: post.id,
  author: {
    id: post.author.id,
    username: post.author.username,
    fullName: post.author.fullName,
    profileImage: post.author.profileImage,
    isPrivate: post.author.isPrivate,
  },
  title: post.title,
  content: post.content,
  image: post.image,
  format: post.format,
  postType: post.postType,
  visibility: post.visibility,
  tags: opts?.tags ?? [], // normalize empty array unless provided
  createdAt: post.createdAt.toISOString(),
  updatedAt: post.updatedAt.toISOString(),
  likesCount: post.likesCount,
  commentsCount: post.commentsCount,
  viewsCount: post.viewsCount,
  isLiked: opts?.isLiked ?? false,
  isSaved: opts?.isSaved ?? false,
  isSponsored: post.isSponsored,
})
