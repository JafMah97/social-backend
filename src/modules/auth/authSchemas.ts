import { z } from 'zod'

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username can only contain letters, numbers, and underscores',
    ),

  email: z.email('Invalid email address'),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be at most 100 characters'),

  fullName: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(50, 'Full name must be at most 50 characters'),
})

// Type inference for request body
export type RegisterInput = z.infer<typeof registerSchema>

// ------------------------------------------------------------------
//login
// ------------------------------------------------------------------
export const loginSchema = z.object({
  email: z.email('Invalid email format'),
  password: z
    .string({ error: 'Password is required' })
    .min(6, 'Password must be at least 6 characters'),
})

export type LoginInput = z.infer<typeof loginSchema>

// ------------------------------------------------------------------
//verifiy the email with code
// ------------------------------------------------------------------

export const verifyEmailWithCodeSchema = z.object({
  email: z.email('Invalid email format'),
  code: z
    .string()
    .length(6, 'Verification code must be exactly 6 characters')
    .regex(/^\d{6}$/, 'Verification code must be numeric'),
})

export type VerifyEmailWithCodeInput = z.infer<typeof verifyEmailWithCodeSchema>

// ------------------------------------------------------------------
// Verifiy the email with link
// ------------------------------------------------------------------

export const verifyEmailWithLinkSchema = z.object({
  token: z.string().min(10, 'Invalid or missing token'),
})

export type VerifyEmailWithLinkInput = z.infer<typeof verifyEmailWithLinkSchema>


// ------------------------------------------------------------------
// Resend Verifectaion Email
// ------------------------------------------------------------------

export const resendVerificationSchema = z.object({
  email: z.email({ message: 'Invalid email format' }),
})

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>


// ------------------------------------------------------------------
// Forgot Password 
// ------------------------------------------------------------------
export const forgotPasswordSchema = z.object({
  email: z.email({ message: 'Invalid email format' }),
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

// ------------------------------------------------------------------
// Reset Password 
// ------------------------------------------------------------------
export const resetPasswordSchema = z.object({
  token: z.string().min(1, { message: 'Reset token is required' }),
  newPassword: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters' }),
})

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
