import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  COMMENTER: 2,
  EDITOR: 3,
  OWNER: 4,
};

export function roleAtLeast(role: Role | null, minRole: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

const MAX_FOLDER_DEPTH = 64;

/**
 * Effective role a user has on a folder: explicit permission on the folder,
 * or inherited from the nearest ancestor folder that grants one.
 * Folder ownership always yields OWNER.
 */
export async function getEffectiveFolderRole(
  userId: string,
  folderId: string | null
): Promise<Role | null> {
  let currentId = folderId;
  let depth = 0;
  let bestRole: Role | null = null;

  while (currentId && depth < MAX_FOLDER_DEPTH) {
    const folder = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { id: true, ownerId: true, parentId: true },
    });
    if (!folder) break;

    if (folder.ownerId === userId) {
      return "OWNER";
    }

    const permission = await prisma.permission.findUnique({
      where: {
        resourceType_resourceId_userId: {
          resourceType: "FOLDER",
          resourceId: folder.id,
          userId,
        },
      },
      select: { role: true },
    });

    if (permission && (!bestRole || ROLE_RANK[permission.role] > ROLE_RANK[bestRole])) {
      bestRole = permission.role;
    }

    currentId = folder.parentId;
    depth += 1;
  }

  return bestRole;
}

export async function getEffectiveDocumentRole(
  userId: string,
  document: { ownerId: string; id: string; folderId: string | null }
): Promise<Role | null> {
  if (document.ownerId === userId) {
    return "OWNER";
  }

  const directPermission = await prisma.permission.findUnique({
    where: {
      resourceType_resourceId_userId: {
        resourceType: "DOCUMENT",
        resourceId: document.id,
        userId,
      },
    },
    select: { role: true },
  });

  const inheritedRole = await getEffectiveFolderRole(userId, document.folderId);

  if (directPermission && inheritedRole) {
    return ROLE_RANK[directPermission.role] >= ROLE_RANK[inheritedRole]
      ? directPermission.role
      : inheritedRole;
  }

  return directPermission?.role ?? inheritedRole ?? null;
}

export async function requireFolderRole(
  userId: string,
  folderId: string,
  minRole: Role
): Promise<void> {
  const role = await getEffectiveFolderRole(userId, folderId);
  if (!roleAtLeast(role, minRole)) {
    throw AppError.forbidden("You do not have sufficient permissions on this folder");
  }
}

export async function requireDocumentRole(
  userId: string,
  document: { ownerId: string; id: string; folderId: string | null },
  minRole: Role
): Promise<void> {
  const role = await getEffectiveDocumentRole(userId, document);
  if (!roleAtLeast(role, minRole)) {
    throw AppError.forbidden("You do not have sufficient permissions on this document");
  }
}

type ResourceType = "FOLDER" | "DOCUMENT";

export async function grantPermission(
  grantedById: string,
  resourceType: ResourceType,
  resourceId: string,
  targetUserId: string,
  role: Role
) {
  if (targetUserId === grantedById) {
    throw AppError.badRequest("Cannot grant a permission to yourself");
  }

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) {
    throw AppError.notFound("Target user not found");
  }

  return prisma.permission.upsert({
    where: {
      resourceType_resourceId_userId: { resourceType, resourceId, userId: targetUserId },
    },
    create: { resourceType, resourceId, userId: targetUserId, role, grantedById },
    update: { role, grantedById },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export async function listPermissions(resourceType: ResourceType, resourceId: string) {
  return prisma.permission.findMany({
    where: { resourceType, resourceId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function revokePermission(resourceType: ResourceType, resourceId: string, permissionId: string) {
  const permission = await prisma.permission.findFirst({
    where: { id: permissionId, resourceType, resourceId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!permission) {
    throw AppError.notFound("Permission not found");
  }
  await prisma.permission.delete({ where: { id: permissionId } });
  return permission;
}
