/* eslint-disable no-unused-vars */
// types.ts (or wherever your Fastify types are declared)
import 'fastify'
import { PrismaClient } from '@prisma/client'
import type { FastifyReplyType } from 'fastify/types/type-provider'

// Define the complete user type based on your Prisma schema
interface RequestUser {
  id: string
  email: string
  username: string
  profileImage: string | null
  fullName: string | null
  isPrivate: boolean
  isProfileComplete: boolean
  emailVerified: boolean
  createdAt: Date
  updatedAt: Date
  isActive: boolean
  iat: number
  exp: number
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
    authenticate: (req: FastifyRequest, rep: FastifyReplyType) => Promise<void>
    authenticateOptional: (
      req: FastifyRequest,
      rep: FastifyReplyType,
    ) => Promise<void>
  }

  interface FastifyRequest {
    user?: RequestUser | undefined
  }
}

export type { RequestUser }
