import { z } from 'zod'

// ------------------------------------------------------------------
// Upload Profile Picture
// ------------------------------------------------------------------
export const uploadProfilePicSchema = z.object({
  profileImage: z.any().optional(), // Will be handled as multipart file
})

export type UploadProfilePicInput = z.infer<typeof uploadProfilePicSchema>

// ------------------------------------------------------------------
// Upload Cover Image
// ------------------------------------------------------------------
export const uploadCoverImageSchema = z.object({
  coverImage: z.any().optional(), // Will be handled as multipart file
})

export type UploadCoverImageInput = z.infer<typeof uploadCoverImageSchema>

// ------------------------------------------------------------------
// Complete Profile
// ------------------------------------------------------------------
export const completeProfileSchema = z.object({
  bio: z.string().max(500, 'Bio must be at most 500 characters').optional(),
  website: z.url('Invalid website URL').optional().or(z.literal('')),
  location: z
    .string()
    .max(100, 'Location must be at most 100 characters')
    .optional(),
  dateOfBirth: z.iso.datetime('Invalid date format').optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
})

export type CompleteProfileInput = z.infer<typeof completeProfileSchema>

// ------------------------------------------------------------------
// Update Profile
// ------------------------------------------------------------------
export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(50, 'Full name must be at most 50 characters')
    .optional(),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username can only contain letters, numbers, and underscores',
    )
    .optional(),
  bio: z.string().max(500, 'Bio must be at most 500 characters').optional(),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  location: z
    .string()
    .max(100, 'Location must be at most 100 characters')
    .optional(),
  dateOfBirth: z.string().datetime('Invalid date format').optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
  isPrivate: z.boolean().optional(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

// ------------------------------------------------------------------
// User Settings
// ------------------------------------------------------------------
export const userSettingsSchema = z.object({
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  storyViewPrivacy: z
    .enum(['EVERYONE', 'FOLLOWERS_ONLY', 'MUTUALS', 'PRIVATE'])
    .optional(),
  allowDirectMessages: z
    .enum(['EVERYONE', 'FOLLOWERS_ONLY', 'NO_ONE'])
    .optional(),
  showOnlineStatus: z.boolean().optional(),
  showReadReceipts: z.boolean().optional(),
  allowTagging: z.boolean().optional(),
  allowSharing: z.boolean().optional(),
  contentVisibility: z.enum(['PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE']).optional(),
})

export type UserSettingsInput = z.infer<typeof userSettingsSchema>

// ------------------------------------------------------------------
// Change Password
// ------------------------------------------------------------------
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(100, 'Password must be at most 100 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

// ------------------------------------------------------------------
// Change Email
// ------------------------------------------------------------------
export const changeEmailSchema = z.object({
  newEmail: z.email('Invalid email address'),
  password: z.string().min(1, 'Password is required to change email'),
})

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>
