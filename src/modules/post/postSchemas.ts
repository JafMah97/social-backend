import { z } from 'zod'

const multipartFileSchema = z
  .object({
    filename: z.string().optional(),
    mimetype: z.string().optional(),
    fieldname: z.string().optional(),
    file: z.any().optional(),
  })
  .loose()

// Create Post Schema
export const createPostSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be at most 200 characters')
    .optional(),

  content: z
    .string()
    .min(1, 'Content is required')
    .max(5000, 'Content must be at most 5000 characters')
    .optional(),

  image: z
    .union([z.url({ message: 'Invalid image URL' }), multipartFileSchema])
    .optional()
    .nullable(),
  format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'POLL', 'LINK']).default('TEXT'),

  postType: z.enum(['STANDARD', 'STORY', 'REEL', 'AD']).default('STANDARD'),

  visibility: z.enum(['PUBLIC', 'PRIVATE', 'FOLLOWERS_ONLY']).default('PUBLIC'),

  tags: z
    .array(z.string().min(1))
    .max(10, 'Maximum 10 tags allowed')
    .optional(),

  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
})

export type CreatePostInput = z.infer<typeof createPostSchema>

// Update Post Schema
export const updatePostSchema = createPostSchema.partial().extend({
  postId: z.cuid('Invalid post ID'),
})

export type UpdatePostInput = z.infer<typeof updatePostSchema>

// Get Post Schema
export const getPostSchema = z.object({
  postId: z.cuid('Invalid post ID'),
})

export type GetPostInput = z.infer<typeof getPostSchema>

// List Posts Schema
export const listPostsSchema = z.object({
  page: z
    .string()
    .transform((val) => Number(val || 1))
    .refine((val) => Number.isInteger(val) && val > 0, {
      message: 'Page must be a positive integer',
    }),

  limit: z
    .string()
    .transform((val) => Number(val || 20))
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 50, {
      message: 'Limit must be between 1 and 50',
    }),

  authorId: z.cuid('Invalid author ID').optional(),
  format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'POLL', 'LINK']).optional(),
})

export type ListPostsInput = z.infer<typeof listPostsSchema>

// Like Post Schema
export const likePostSchema = z.object({
  postId: z.cuid('Invalid post ID'),
})

export type LikePostInput = z.infer<typeof likePostSchema>

// Save Post Schema
export const savePostSchema = z.object({
  postId: z.cuid('Invalid post ID'),
})

export type SavePostInput = z.infer<typeof savePostSchema>

// Delete Post Schema
export const deletePostSchema = z.object({
  postId: z.cuid('Invalid post ID'),
})

export type DeletePostInput = z.infer<typeof deletePostSchema>

// For listing saved posts
export const listSavedPostsSchema = z.object({
  page: z
    .string()
    .transform((val) => Number(val || 1))
    .refine((val) => Number.isInteger(val) && val > 0, {
      message: 'Page must be a positive integer',
    }),

  limit: z
    .string()
    .transform((val) => Number(val || 20))
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 50, {
      message: 'Limit must be between 1 and 50',
    }),
})

export type ListSavedPostsInput = z.infer<typeof listSavedPostsSchema>

// If you want to add filtering options later, you can extend this:
export const listSavedPostsWithFilterSchema = listSavedPostsSchema.extend({
  // Example: filter by post format
  format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'POLL', 'LINK']).optional(),
})
