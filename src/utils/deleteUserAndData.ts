//src\utils\deleteUserAndData.ts
// This utility function is responsible for permanently and safely deleting a user
// and all their associated data from the database.
// It is critical for maintaining data integrity and complying with privacy regulations.

import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// Configuration constants
const BATCH_SIZE = 1000
const BATCH_DELAY_MS = 100

// Define proper TypeScript types for transaction and conditions
type TransactionType = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>
type WhereCondition =
  | Prisma.UserWhereInput
  | Prisma.PostWhereInput
  | Prisma.CommentWhereInput
  | Prisma.StoryWhereInput
  | Prisma.ConversationWhereInput
  | Prisma.NotificationWhereInput
  | Prisma.MessageWhereInput
  | Prisma.FollowWhereInput
  | Prisma.FollowRequestWhereInput
  | Prisma.UserMediaWhereInput
  | Prisma.UserActivityLogWhereInput
  | Prisma.UserSettingsWhereInput
  | Prisma.UserRoleWhereInput
  | Prisma.VerificationTokenWhereInput
  | Prisma.SessionWhereInput
  | Prisma.PostTagWhereInput
  | Prisma.ReportWhereInput
  | Prisma.StoryViewWhereInput
  | Prisma.StoryHighlightWhereInput
  | Prisma.StoryLikeWhereInput
  | Prisma.CommentLikeWhereInput
  | Prisma.CommentAuthorInfoWhereInput
  | Prisma.LikeWhereInput
  | Prisma.SavedPostWhereInput

/**
 * Deletes records in batches to prevent database timeouts and handle large datasets
 */
async function deleteInBatches(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  model: string,
  whereCondition: WhereCondition,
  batchSize: number = BATCH_SIZE,
): Promise<number> {
  let totalDeleted = 0
  let shouldContinue = true

  // Validate that the model exists on the transaction client
  if (!tx[model] || typeof tx[model].deleteMany !== 'function') {
    throw new Error(`Invalid model or deleteMany not supported: ${model}`)
  }

  while (shouldContinue) {
    try {
      const result = await tx[model].deleteMany({
        where: whereCondition,
        take: batchSize,
      })

      totalDeleted += result.count
      shouldContinue = result.count === batchSize

      if (shouldContinue) {
        await new Promise((resolve) =>
          globalThis.setTimeout(resolve, BATCH_DELAY_MS),
        )
      }
    } catch (error) {
      console.error(`[BatchDelete] Error deleting from ${model}:`, error)
      throw error
    }
  }

  return totalDeleted
}
/**
 * Validates if the user can be deleted safely
 */
async function validateUserDeletion(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: true,
      _count: {
        select: {
          Post: true,
          Comment: true,
          followers: true, // Fixed: Use 'followers' instead of 'Follow'
          following: true, // Fixed: Use 'following' instead of 'Follow'
          Story: true,
          conversationsAsUser1: true, // Fixed: Use actual relation names
          conversationsAsUser2: true,
        },
      },
    },
  })

  if (!user) {
    throw new Error(`User with id ${userId} not found`)
  }

  // Fixed: Check role correctly
  if (user.role?.role === 'ADMIN') {
    throw new Error(
      'Cannot delete admin users through this method. Use admin-specific deletion process.',
    )
  }

  if (user.isBanned) {
    console.warn(`[Validation] User ${userId} is already banned`)
  }

  // Fixed: Use correct _count properties
  console.info(
    `[Validation] User ${userId} has: ${user._count.Post} posts, ${user._count.Comment} comments, ${user._count.followers} followers, ${user._count.following} following, ${user._count.Story} stories, ${user._count.conversationsAsUser1 + user._count.conversationsAsUser2} conversations`,
  )
}

/**
 * Performs a soft delete as a safety measure before permanent deletion
 */
async function softDeleteUser(
  tx: TransactionType,
  userId: string,
): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: {
      isActive: false,
      isBanned: true,
      banReason: 'Account deletion in progress',
      email: `deleted-${Date.now()}@deleted.invalid`,
      username: `deleted_${Date.now()}`,
      updatedAt: new Date(),
    },
  })
}

/**
 * Permanently deletes a user and all their related data from the database.
 * This function performs a cascade delete in proper dependency order to ensure
 * all foreign-key constraints are satisfied.
 *
 * @param userId The ID of the user to be deleted.
 * @param enableSoftDelete Whether to perform a soft delete first (recommended for safety).
 */
export async function deleteUserAndData(
  userId: string,
  enableSoftDelete: boolean = true,
): Promise<{
  success: boolean
  deletedCounts: Record<string, number>
  duration: number
}> {
  const startTime = Date.now()
  const deletedCounts: Record<string, number> = {}

  console.info(`[Cleanup] Starting deletion process for userId=${userId}`)

  try {
    // Step 1: Validate the user can be deleted
    await validateUserDeletion(userId)

    const result = await prisma.$transaction(
      async (tx) => {
        // Step 2: Optional soft delete for safety
        if (enableSoftDelete) {
          console.info(`[Cleanup] Performing soft delete for userId=${userId}`)
          await softDeleteUser(tx as TransactionType, userId)
        }

        // Step 3: Delete data in proper dependency order

        // 3.1 Story-related data (most dependent first)
        console.info(`[Cleanup] Deleting story views...`)
        deletedCounts.storyViews = await deleteInBatches(
          tx as TransactionType,
          'storyView',
          {
            OR: [{ viewerId: userId }, { story: { userId } }],
          },
        )

        console.info(`[Cleanup] Deleting story likes...`)
        deletedCounts.storyLikes = await deleteInBatches(
          tx as TransactionType,
          'storyLike',
          {
            OR: [{ userId }, { story: { userId } }],
          },
        )

        console.info(`[Cleanup] Deleting story highlights...`)
        deletedCounts.storyHighlights = await deleteInBatches(
          tx as TransactionType,
          'storyHighlight',
          {
            userId,
          },
        )

        console.info(`[Cleanup] Deleting stories...`)
        deletedCounts.stories = await deleteInBatches(
          tx as TransactionType,
          'story',
          {
            userId,
          },
        )

        // 3.2 Comment-related data
        console.info(`[Cleanup] Deleting comment likes...`)
        deletedCounts.commentLikes = await deleteInBatches(
          tx as TransactionType,
          'commentLike',
          {
            OR: [{ userId }, { comment: { authorId: userId } }],
          },
        )

        console.info(`[Cleanup] Deleting comment author info...`)
        deletedCounts.commentAuthorInfo = await deleteInBatches(
          tx as TransactionType,
          'commentAuthorInfo',
          {
            authorId: userId,
          },
        )

        console.info(`[Cleanup] Deleting comments...`)
        deletedCounts.comments = await deleteInBatches(
          tx as TransactionType,
          'comment',
          {
            authorId: userId,
          },
        )

        // 3.3 Message and conversation data
        console.info(`[Cleanup] Deleting messages...`)
        deletedCounts.messages = await deleteInBatches(
          tx as TransactionType,
          'message',
          {
            OR: [{ senderId: userId }, { recipientId: userId }],
          },
        )

        console.info(`[Cleanup] Deleting conversations...`)
        deletedCounts.conversations = await deleteInBatches(
          tx as TransactionType,
          'conversation',
          {
            OR: [{ user1Id: userId }, { user2Id: userId }],
          },
        )

        // 3.4 Post engagement data
        console.info(`[Cleanup] Deleting likes...`)
        deletedCounts.likes = await deleteInBatches(
          tx as TransactionType,
          'like',
          {
            userId,
          },
        )

        console.info(`[Cleanup] Deleting saved posts...`)
        deletedCounts.savedPosts = await deleteInBatches(
          tx as TransactionType,
          'savedPost',
          {
            userId,
          },
        )

        // 3.5 Social graph data
        console.info(`[Cleanup] Deleting follow requests...`)
        deletedCounts.followRequests = await deleteInBatches(
          tx as TransactionType,
          'followRequest',
          {
            OR: [{ senderId: userId }, { receiverId: userId }],
          },
        )

        console.info(`[Cleanup] Deleting follows...`)
        deletedCounts.follows = await deleteInBatches(
          tx as TransactionType,
          'follow',
          {
            OR: [{ followerId: userId }, { followingId: userId }],
          },
        )

        // 3.6 Notification data
        console.info(`[Cleanup] Deleting notifications...`)
        deletedCounts.notifications = await deleteInBatches(
          tx as TransactionType,
          'notification',
          {
            OR: [{ userId }, { actorId: userId }],
          },
        )

        // 3.7 User media and activity
        console.info(`[Cleanup] Deleting user media...`)
        deletedCounts.userMedia = await deleteInBatches(
          tx as TransactionType,
          'userMedia',
          {
            userId,
          },
        )

        console.info(`[Cleanup] Deleting user activity logs...`)
        deletedCounts.userActivityLogs = await deleteInBatches(
          tx as TransactionType,
          'userActivityLog',
          {
            userId,
          },
        )

        // 3.8 User settings and authentication data
        console.info(`[Cleanup] Deleting user settings...`)
        deletedCounts.userSettings = await deleteInBatches(
          tx as TransactionType,
          'userSettings',
          {
            userId,
          },
        )

        console.info(`[Cleanup] Deleting user roles...`)
        deletedCounts.userRoles = await deleteInBatches(
          tx as TransactionType,
          'userRole',
          {
            userId,
          },
        )

        console.info(`[Cleanup] Deleting verification tokens...`)
        deletedCounts.verificationTokens = await deleteInBatches(
          tx as TransactionType,
          'verificationToken',
          {
            userId,
          },
        )

        console.info(`[Cleanup] Deleting sessions...`)
        deletedCounts.sessions = await deleteInBatches(
          tx as TransactionType,
          'session',
          {
            userId,
          },
        )

        // 3.9 Post data (handle posts and their tags)
        console.info(`[Cleanup] Deleting post tags...`)
        deletedCounts.postTags = await deleteInBatches(
          tx as TransactionType,
          'postTag',
          {
            post: { authorId: userId },
          },
        )

        console.info(`[Cleanup] Deleting posts...`)
        deletedCounts.posts = await deleteInBatches(
          tx as TransactionType,
          'post',
          {
            authorId: userId,
          },
        )

        // 3.10 Report data
        console.info(`[Cleanup] Deleting reports...`)
        deletedCounts.reports = await deleteInBatches(
          tx as TransactionType,
          'report',
          {
            reporterId: userId,
          },
        )

        // 3.11 Finally delete the user
        console.info(`[Cleanup] Deleting user record...`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (tx as any).user.delete({ where: { id: userId } })
        deletedCounts.user = 1

        return deletedCounts
      },
      {
        timeout: 300000, // 5 minutes timeout for large deletions
        maxWait: 300000,
      },
    )

    const duration = Date.now() - startTime

    console.info(
      `[Cleanup] Successfully deleted userId=${userId} in ${duration}ms`,
    )
    console.info(`[Cleanup] Deletion summary:`, result)

    return {
      success: true,
      deletedCounts: result,
      duration,
    }
  } catch (error: unknown) {
    const duration = Date.now() - startTime

    console.error(
      `[Cleanup] Failed to delete data for userId=${userId} after ${duration}ms:`,
      error,
    )

    // Handle specific error cases
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        console.error(
          `[Cleanup] Foreign key constraint violation. Check deletion order.`,
        )
      } else if (error.code === 'P2025') {
        console.error(
          `[Cleanup] Record not found. User may have been already deleted.`,
        )
      } else if (error.code === 'P2034') {
        console.error(`[Cleanup] Transaction conflict. Please retry.`)
      }
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'
    throw new Error(`Failed to delete user ${userId}: ${errorMessage}`)
  }
}

/**
 * Alternative function for soft deletion only (for compliance with data retention policies)
 */
export async function softDeleteUserOnly(userId: string): Promise<void> {
  console.info(`[SoftDelete] Starting soft deletion for userId=${userId}`)

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        isBanned: true,
        banReason: 'Account deleted by user request',
        email: `deleted-${Date.now()}@deleted.invalid`,
        username: `deleted_${Date.now()}`,
        profileImage: '/uploads/deleted-avatar.png',
        coverImage: '/uploads/deleted-cover.jpg',
        isProfileComplete: false,
        updatedAt: new Date(),
        // Clear sensitive data
        passwordHash: 'DELETED',
        verificationCode: null,
        emailVerificationToken: null,
        resetPasswordToken: null,
        resetPasswordTokenExpiresAt: null,
      },
    })

    console.info(`[SoftDelete] Successfully soft-deleted userId=${userId}`)
  } catch (error) {
    console.error(`[SoftDelete] Failed to soft-delete userId=${userId}:`, error)
    throw error
  }
}

/**
 * Utility to check what data would be deleted (dry run)
 */
export async function previewUserDeletion(
  userId: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}

  try {
    counts.user = await prisma.user.count({ where: { id: userId } })
    counts.posts = await prisma.post.count({ where: { authorId: userId } })
    counts.comments = await prisma.comment.count({
      where: { authorId: userId },
    })
    counts.likes = await prisma.like.count({ where: { userId } })
    counts.savedPosts = await prisma.savedPost.count({ where: { userId } })
    counts.follows = await prisma.follow.count({
      where: { OR: [{ followerId: userId }, { followingId: userId }] },
    })
    counts.followRequests = await prisma.followRequest.count({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    })
    counts.stories = await prisma.story.count({ where: { userId } })
    counts.conversations = await prisma.conversation.count({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
    })
    counts.messages = await prisma.message.count({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
    })
    counts.notifications = await prisma.notification.count({
      where: { OR: [{ userId }, { actorId: userId }] },
    })

    console.info(`[Preview] Deletion preview for userId=${userId}:`, counts)
    return counts
  } catch (error) {
    console.error(
      `[Preview] Failed to preview deletion for userId=${userId}:`,
      error,
    )
    throw error
  }
}

// Export for testing and other utilities
export { BATCH_SIZE, BATCH_DELAY_MS }
