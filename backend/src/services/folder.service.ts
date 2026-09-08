import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { CreateFolderInput, UpdateFolderInput } from "../schemas/folder.schema";
import { requireFolderRole } from "./permission.service";

const MAX_DEPTH = 64;

async function assertNoCycle(folderId: string, newParentId: string): Promise<void> {
  let currentId: string | null = newParentId;
  let depth = 0;

  while (currentId && depth < MAX_DEPTH) {
    if (currentId === folderId) {
      throw AppError.badRequest("Cannot move a folder into itself or one of its descendants");
    }
    const parent: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!parent) break;
    currentId = parent.parentId;
    depth += 1;
  }
}

export async function createFolder(userId: string, input: CreateFolderInput) {
  if (input.parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: input.parentId, deletedAt: null },
    });
    if (!parent) {
      throw AppError.notFound("Parent folder not found");
    }
    await requireFolderRole(userId, input.parentId, "EDITOR");
  }

  return prisma.folder.create({
    data: {
      name: input.name,
      parentId: input.parentId ?? null,
      ownerId: userId,
    },
  });
}

export async function getFolder(userId: string, folderId: string) {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, deletedAt: null },
  });
  if (!folder) {
    throw AppError.notFound("Folder not found");
  }
  await requireFolderRole(userId, folderId, "VIEWER");
  return folder;
}

export async function listFolders(userId: string, parentId: string | null) {
  if (parentId) {
    await requireFolderRole(userId, parentId, "VIEWER");
  }

  const folders = await prisma.folder.findMany({
    where: { parentId, deletedAt: null },
    orderBy: { name: "asc" },
  });

  const visible = [];
  for (const folder of folders) {
    if (folder.ownerId === userId) {
      visible.push(folder);
      continue;
    }
    const role = await requireFolderRoleSafe(userId, folder.id);
    if (role) visible.push(folder);
  }
  return visible;
}

async function requireFolderRoleSafe(userId: string, folderId: string) {
  try {
    await requireFolderRole(userId, folderId, "VIEWER");
    return true;
  } catch {
    return false;
  }
}

export async function updateFolder(userId: string, folderId: string, input: UpdateFolderInput) {
  const folder = await prisma.folder.findFirst({ where: { id: folderId, deletedAt: null } });
  if (!folder) {
    throw AppError.notFound("Folder not found");
  }
  await requireFolderRole(userId, folderId, "EDITOR");

  let destinationFolderName: string | null = null;
  if (input.parentId !== undefined && input.parentId !== null) {
    const newParent = await prisma.folder.findFirst({
      where: { id: input.parentId, deletedAt: null },
    });
    if (!newParent) {
      throw AppError.notFound("Destination folder not found");
    }
    await requireFolderRole(userId, input.parentId, "EDITOR");
    await assertNoCycle(folderId, input.parentId);
    destinationFolderName = newParent.name;
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (input.name !== undefined && input.name !== folder.name) {
    changes.name = { from: folder.name, to: input.name };
  }
  if (input.parentId !== undefined && input.parentId !== folder.parentId) {
    changes.parent = {
      from: folder.parentId ? { id: folder.parentId } : null,
      to: input.parentId ? { id: input.parentId, name: destinationFolderName } : null,
    };
  }

  const updated = await prisma.folder.update({
    where: { id: folderId },
    data: {
      name: input.name,
      parentId: input.parentId === undefined ? undefined : input.parentId,
    },
  });

  return { folder: updated, changes };
}

export async function listDeletedFolders(userId: string) {
  // Trash is owner-scoped, matching the OWNER requirement on soft-delete.
  return prisma.folder.findMany({
    where: { ownerId: userId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
  });
}

export async function restoreFolder(userId: string, folderId: string) {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, deletedAt: { not: null } },
  });
  if (!folder) {
    throw AppError.notFound("Deleted folder not found");
  }
  if (folder.ownerId !== userId) {
    throw AppError.forbidden("Only the owner can restore this folder");
  }

  // If the parent folder is still deleted, restoring into it would hide this
  // folder inside a deleted ancestor. Restore to the root in that case.
  let parentId = folder.parentId;
  if (parentId) {
    const parent = await prisma.folder.findFirst({ where: { id: parentId, deletedAt: null } });
    if (!parent) parentId = null;
  }

  return prisma.folder.update({
    where: { id: folderId },
    data: { deletedAt: null, parentId },
  });
}

export async function softDeleteFolder(userId: string, folderId: string) {
  const folder = await prisma.folder.findFirst({ where: { id: folderId, deletedAt: null } });
  if (!folder) {
    throw AppError.notFound("Folder not found");
  }
  await requireFolderRole(userId, folderId, "OWNER");

  return prisma.folder.update({
    where: { id: folderId },
    data: { deletedAt: new Date() },
  });
}
