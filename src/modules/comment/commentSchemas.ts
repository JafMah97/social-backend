import { z } from 'zod'

// Create Comment Schema
export const createCommentSchema = z.object({
  postId: z.cuid('Invalid post ID'),
  content: z
    .string()
    .min(1, 'Content is required')
    .max(1000, 'Content must be at most 1000 characters'),
})

export type CreateCommentInput = z.infer<typeof createCommentSchema>

// Update Comment Schema
export const updateCommentSchema = z.object({
  commentId: z.cuid('Invalid comment ID'),
  content: z
    .string()
    .min(1, 'Content is required')
    .max(1000, 'Content must be at most 1000 characters'),
})

export type UpdateCommentInput = z.infer<typeof updateCommentSchema>

// Delete Comment Schema
export const deleteCommentSchema = z.object({
  commentId: z.cuid('Invalid comment ID'),
})

export type DeleteCommentInput = z.infer<typeof deleteCommentSchema>

// Get Comments by Post ID Schema
export const getCommentsByPostIdSchema = z.object({
  postId: z.cuid('Invalid post ID'),
  page: z
    .string()
    .transform((val) => Number(val || 1))
    .refine((val) => Number.isInteger(val) && val > 0, {
      message: 'Page must be a positive integer',
    })
   ,
  limit: z
    .string()
    .transform((val) => Number(val || 20))
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 50, {
      message: 'Limit must be between 1 and 50',
    })
  ,
})

export type GetCommentsByPostIdInput = z.infer<typeof getCommentsByPostIdSchema>

// Like Comment Schema
export const likeCommentSchema = z.object({
  commentId: z.cuid('Invalid comment ID'),
})

export type LikeCommentInput = z.infer<typeof likeCommentSchema>

// Unlike Comment Schema
export const unlikeCommentSchema = z.object({
  commentId: z.cuid('Invalid comment ID'),
})

export type UnlikeCommentInput = z.infer<typeof unlikeCommentSchema>
