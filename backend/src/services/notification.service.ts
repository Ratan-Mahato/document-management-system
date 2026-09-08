import { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { emitToUser } from "../realtime/socket";

type ResourceType = "FOLDER" | "DOCUMENT";

export interface CreateNotificationInput {
  userId: string; // recipient
  type: NotificationType;
  message: string;
  resource?: { type: ResourceType; id: string };
  actorId?: string | null;
}

/**
 * Best-effort: notifications must never break the request that triggered them.
 * A user is never notified about their own action.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  if (input.actorId && input.actorId === input.userId) {
    return;
  }
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        message: input.message,
        resourceType: input.resource?.type,
        resourceId: input.resource?.id,
        actorId: input.actorId ?? null,
      },
    });
    emitToUser(input.userId, "notification:new", notification);
  } catch (err) {
    console.error("Failed to create notification", err);
  }
}

export async function listNotifications(
  userId: string,
  { unreadOnly = false, take = 50 }: { unreadOnly?: boolean; take?: number } = {}
) {
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { notifications, unreadCount };
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/**
 * Scoped to userId so a caller can only mark their own notifications read.
 * Uses updateMany (not update) so a foreign id simply matches nothing.
 */
export async function markRead(userId: string, id: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
