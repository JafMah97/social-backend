import nodemailer from 'nodemailer'
import dotenv from 'dotenv'

dotenv.config()

// Decide which frontend URL to use based on NODE_ENV
const NODE_ENV = process.env.NODE_ENV || 'development'
const FRONTEND_URL =
  NODE_ENV === 'production'
    ? process.env.PROD_ORIGIN
    : process.env.DEV_ORIGIN || 'http://localhost:3000'

// Configure SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

// Common sender
const EMAIL_FROM = process.env.SMTP_USER

export async function sendVerificationCode(
  email: string,
  code: string,
  token?: string,
) {
  const verifyLink = token
    ? `${FRONTEND_URL}/auth/verify-email?token=${token}`
    : null

  const html = `
    <div style="font-family: Arial, sans-serif; color: #333; background-color: #f8f9fa; padding: 20px;">
      <h2 style="color: #444;">Thank you for registering!</h2>
      <p>Please use the verification code below to activate your account:</p>
      <div style="text-align: center; font-size: 24px; font-weight: bold; color: #1e90ff; margin: 16px 0;">${code}</div>
      ${verifyLink ? `<p>You can also <a href="${verifyLink}" style="color: #1e90ff;">click here to verify your email</a>.</p>` : ''}
      <p>If you didn’t request this registration, you can safely ignore this email.</p>
      <footer style="text-align: center; font-size: 12px; color: #888;">&copy; ${new Date().getFullYear()} Konekta. All rights reserved.</footer>
    </div>
  `

  const info = await transporter.sendMail({
    from: `"Konekta" <${EMAIL_FROM}>`,
    to: email,
    subject: 'Welcome to Konekta! Verify Your Email',
    html,
  })

  console.log(
    `[Email] Sent verification email to ${email}, messageId=${info.messageId}`,
  )
}

export async function sendPasswordResetLink(email: string, token: string) {
  const link = `${FRONTEND_URL}/auth/reset-password?token=${token}`

  const html = `
    <div style="font-family: Arial, sans-serif; color: #333; background-color: #f8f9fa; padding: 20px;">
      <h2 style="color: #444;">Reset Your Password</h2>
      <p>We received a request to reset your password. Click the button below to proceed:</p>
      <div style="text-align: center; margin: 20px 0;">
        <a href="${link}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #ff69b4, #8a2be2); color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
      </div>
      <p>If you didn’t request this, you can safely ignore this email.</p>
      <footer style="text-align: center; font-size: 12px; color: #888;">&copy; ${new Date().getFullYear()} Konekta. All rights reserved.</footer>
    </div>
  `

  const info = await transporter.sendMail({
    from: `"Konekta" <${EMAIL_FROM}>`,
    to: email,
    subject: 'Reset Your Konekta Password',
    html,
  })

  console.log(
    `[Email] Sent password reset email to ${email}, messageId=${info.messageId}`,
  )
}
