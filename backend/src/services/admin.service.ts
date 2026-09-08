import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

const SALT_ROUNDS = 12;

// Generate a readable-but-strong temporary password (base64url, no ambiguous
// padding). ~18 bytes → 24 chars of entropy, well above the 8-char minimum.
function generatePassword(): string {
  return crypto.randomBytes(18).toString("base64url");
}

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  systemRole: true,
  deactivatedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type UserStatusFilter = "all" | "active" | "deactivated";

export interface ListUsersOptions {
  q?: string;
  status?: UserStatusFilter;
  take?: number;
  skip?: number;
}

export async function listUsers(options: ListUsersOptions = {}) {
  const take = Math.min(options.take ?? 50, 200);
  const skip = options.skip ?? 0;
  const where: Prisma.UserWhereInput = {};
  if (options.q) {
    where.OR = [
      { name: { contains: options.q, mode: "insensitive" } },
      { email: { contains: options.q, mode: "insensitive" } },
    ];
  }
  if (options.status === "active") {
    where.deactivatedAt = null;
  } else if (options.status === "deactivated") {
    where.deactivatedAt = { not: null };
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { ...publicUserSelect, _count: { select: { ownedDocuments: true, ownedFolders: true } } },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total };
}

async function getManagedUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) {
    throw AppError.notFound("User not found");
  }
  return user;
}

export async function setUserSystemRole(actorId: string, targetUserId: string, role: "USER" | "ADMIN") {
  const target = await getManagedUser(targetUserId);

  if (target.id === actorId && role === "USER") {
    throw AppError.badRequest("You cannot remove your own administrator access", "CANNOT_DEMOTE_SELF");
  }

  if (target.systemRole === role) {
    return target; // no-op, already at the requested role
  }

  // Guard against locking the system out of all admins.
  if (target.systemRole === "ADMIN" && role === "USER") {
    const adminCount = await prisma.user.count({
      where: { systemRole: "ADMIN", deactivatedAt: null },
    });
    if (adminCount <= 1) {
      throw AppError.badRequest("Cannot demote the last administrator", "LAST_ADMIN");
    }
  }

  return prisma.user.update({
    where: { id: target.id },
    data: { systemRole: role },
    select: publicUserSelect,
  });
}

export async function setUserActivation(actorId: string, targetUserId: string, deactivated: boolean) {
  const target = await getManagedUser(targetUserId);

  if (target.id === actorId && deactivated) {
    throw AppError.badRequest("You cannot deactivate your own account", "CANNOT_DEACTIVATE_SELF");
  }

  const alreadyInState = deactivated ? target.deactivatedAt !== null : target.deactivatedAt === null;
  if (alreadyInState) {
    return target; // no-op
  }

  // Deactivating an admin must not remove the last active admin.
  if (deactivated && target.systemRole === "ADMIN") {
    const adminCount = await prisma.user.count({
      where: { systemRole: "ADMIN", deactivatedAt: null },
    });
    if (adminCount <= 1) {
      throw AppError.badRequest("Cannot deactivate the last administrator", "LAST_ADMIN");
    }
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { deactivatedAt: deactivated ? new Date() : null },
    select: publicUserSelect,
  });

  // Revoke all active sessions when deactivating so access ends immediately.
  if (deactivated) {
    await prisma.refreshToken.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  return updated;
}

export async function resetUserPassword(targetUserId: string, newPassword?: string) {
  const target = await getManagedUser(targetUserId);

  const password = newPassword ?? generatePassword();
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  await prisma.user.update({ where: { id: target.id }, data: { hashedPassword } });

  // Force re-authentication everywhere: revoke all of the target's sessions.
  await prisma.refreshToken.updateMany({
    where: { userId: target.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // Only surface the password to the admin when the server generated it; if the
  // admin supplied one they already know it, so we don't echo it back.
  return { user: target, generatedPassword: newPassword ? null : password };
}

export interface ListGlobalAuditOptions {
  userId?: string;
  action?: string;
  take?: number;
  skip?: number;
}

export async function listGlobalAuditLogs(options: ListGlobalAuditOptions = {}) {
  const take = Math.min(options.take ?? 100, 500);
  const skip = options.skip ?? 0;
  const where: Prisma.AuditLogWhereInput = {};
  if (options.userId) where.userId = options.userId;
  if (options.action) where.action = options.action as Prisma.AuditLogWhereInput["action"];

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}
