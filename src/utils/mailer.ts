// src/utils/mailer.ts

import nodemailer from 'nodemailer'
import dotenv from 'dotenv'

dotenv.config()

const BASE_URL_FRONTEND = process.env.BASE_URL_FRONTEND

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendVerificationCode(
  email: string,
  code: string,
  token?: string,
) {
  const verifyLink = token
    ? `${BASE_URL_FRONTEND}/auth/verify-email?token=${token}`
    : null

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Welcome to Konekta! Verify Your Email',
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; background-color: #f8f9fa; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="text-align: center; font-family: Arial, sans-serif;">
  <span style="
    display: inline-block;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, #ff69b4, #8a2be2);
    color: white;
    font-size: 24px;
    font-weight: bold;
    line-height: 40px;
    text-align: center;
    vertical-align: middle;
    margin-right: 0px;
  ">
    K
  </span>
  <span style="font-weight: bold; font-size: 24px;">
  <span style="color: #ff69b4;">o</span>
  <span style="color: #e754c7;">n</span>
  <span style="color: #cc3fd2;">e</span>
  <span style="color: #b52adc;">k</span>
  <span style="color: #9f15e7;">t</span>
  <span style="color: #8a2be2;">a</span>
</span>

</h1>

          <h2 style="color: #444;">Thank you for registering!</h2>
        </div>

        <p>We're thrilled to welcome you aboard. Konekta values your privacy—your personal and social data is securely stored and never shared with third parties.</p>

        <p>Please use the verification code below to activate your account:</p>
        <div style="text-align: center; font-size: 24px; font-weight: bold; color: #1e90ff; margin: 16px 0;">
          ${code}
        </div>

        ${
          verifyLink
            ? `<p>You can also <a href="${verifyLink}" style="color: #1e90ff;">click here to verify your email</a> instantly.</p>`
            : ''
        }

        <p>If you didn’t request this registration, you can safely ignore this email.</p>

        <hr style="margin: 40px 0;" />

        <footer style="text-align: center; font-size: 12px; color: #888;">
          &copy; ${new Date().getFullYear()} Konekta. All rights reserved.
        </footer>
      </div>
    `,
  }

  await transporter.sendMail(mailOptions).catch((err) => {
    console.log(err, '[Mailer] Gmail SMTP failed')
    throw {
      statusCode: 500,
      code: 'emailDeliveryFailed',
      message: 'Failed to send email. Please try again later.',
    }
  })
}
export async function sendPasswordResetLink(email: string, token: string) {
  const link = `${BASE_URL_FRONTEND}/auth/reset-password?token=${token}`

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Reset Your Konekta Password',
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; background-color: #f8f9fa; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="text-align: center; font-family: Arial, sans-serif;">
            <span style="
              display: inline-block;
              width: 40px;
              height: 40px;
              border-radius: 50%;
              background: linear-gradient(135deg, #ff69b4, #8a2be2);
              color: white;
              font-size: 24px;
              font-weight: bold;
              line-height: 40px;
              text-align: center;
              vertical-align: middle;
              margin-right: 0px;
            ">
              K
            </span>
            <span style="font-weight: bold; font-size: 24px;">
              <span style="color: #ff69b4;">o</span>
              <span style="color: #e754c7;">n</span>
              <span style="color: #cc3fd2;">e</span>
              <span style="color: #b52adc;">k</span>
              <span style="color: #9f15e7;">t</span>
              <span style="color: #8a2be2;">a</span>
            </span>
          </h1>

          <h2 style="color: #444;">Reset Your Password</h2>
        </div>

        <p>We received a request to reset your password. Click the button below to proceed:</p>

        <div style="text-align: center; margin: 20px 0;">
          <a href="${link}" style="
            display: inline-block;
            padding: 12px 24px;
            background: linear-gradient(135deg, #ff69b4, #8a2be2);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
          ">
            Reset Password
          </a>
        </div>

        <p>If you didn’t request this, you can safely ignore this email.</p>

        <hr style="margin: 40px 0;" />

        <footer style="text-align: center; font-size: 12px; color: #888;">
          &copy; ${new Date().getFullYear()} Konekta. All rights reserved.
        </footer>
      </div>
    `,
  }

  await transporter.sendMail(mailOptions)
  console.log(`[Email] Sent styled password reset email to ${email}`)
}
