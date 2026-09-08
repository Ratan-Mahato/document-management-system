import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  createFolder,
  getFolder,
  listDeletedFolders,
  listFolders,
  restoreFolder,
  softDeleteFolder,
  updateFolder,
} from "../services/folder.service";
import {
  grantPermission,
  listPermissions,
  requireFolderRole,
  revokePermission,
} from "../services/permission.service";
import { listAuditLogs, recordAuditLog } from "../services/audit.service";
import { createNotification } from "../services/notification.service";
import { prisma } from "../lib/prisma";

function ctx(req: Request) {
  return { userId: req.user!.id, ipAddress: req.ip ?? null };
}

// The access token carries id/email but not the display name; look it up for
// human-readable notification messages.
async function actorName(req: Request): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { name: true },
  });
  return user?.name ?? req.user!.email;
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const folder = await createFolder(req.user!.id, req.body);
  await recordAuditLog(ctx(req), "CREATE", { type: "FOLDER", id: folder.id }, { name: folder.name });
  res.status(201).json({ folder });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const parentId = (req.query.parentId as string | undefined) ?? null;
  const folders = await listFolders(req.user!.id, parentId);
  res.status(200).json({ folders });
});

export const listTrash = asyncHandler(async (req: Request, res: Response) => {
  const folders = await listDeletedFolders(req.user!.id);
  res.status(200).json({ folders });
});

export const restore = asyncHandler(async (req: Request, res: Response) => {
  const folder = await restoreFolder(req.user!.id, req.params.id);
  await recordAuditLog(ctx(req), "RESTORE", { type: "FOLDER", id: folder.id }, { name: folder.name });
  res.status(200).json({ folder });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const folder = await getFolder(req.user!.id, req.params.id);
  res.status(200).json({ folder });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { folder, changes } = await updateFolder(req.user!.id, req.params.id, req.body);
  if (Object.keys(changes).length > 0) {
    await recordAuditLog(ctx(req), "UPDATE", { type: "FOLDER", id: folder.id }, { name: folder.name, changes });
  }
  res.status(200).json({ folder });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const folder = await getFolder(req.user!.id, req.params.id);
  await softDeleteFolder(req.user!.id, req.params.id);
  await recordAuditLog(ctx(req), "DELETE", { type: "FOLDER", id: req.params.id }, { name: folder.name });
  res.status(204).send();
});

export const grantFolderPermission = asyncHandler(async (req: Request, res: Response) => {
  const folder = await getFolder(req.user!.id, req.params.id);
  await requireFolderRole(req.user!.id, req.params.id, "OWNER");
  const { userId, role } = req.body;
  const permission = await grantPermission(req.user!.id, "FOLDER", req.params.id, userId, role);
  await recordAuditLog(
    ctx(req),
    "SHARE",
    { type: "FOLDER", id: req.params.id },
    { folderName: folder.name, targetName: permission.user.name, targetEmail: permission.user.email, role }
  );
  await createNotification({
    userId: permission.user.id,
    type: "SHARED",
    message: `${await actorName(req)} shared the folder “${folder.name}” with you as ${role}`,
    resource: { type: "FOLDER", id: req.params.id },
    actorId: req.user!.id,
  });
  res.status(201).json({ permission });
});

export const listFolderPermissions = asyncHandler(async (req: Request, res: Response) => {
  await requireFolderRole(req.user!.id, req.params.id, "EDITOR");
  const permissions = await listPermissions("FOLDER", req.params.id);
  res.status(200).json({ permissions });
});

export const revokeFolderPermission = asyncHandler(async (req: Request, res: Response) => {
  const folder = await getFolder(req.user!.id, req.params.id);
  await requireFolderRole(req.user!.id, req.params.id, "OWNER");
  const revoked = await revokePermission("FOLDER", req.params.id, req.params.permissionId);
  await recordAuditLog(
    ctx(req),
    "UNSHARE",
    { type: "FOLDER", id: req.params.id },
    { folderName: folder.name, targetName: revoked.user.name, targetEmail: revoked.user.email, priorRole: revoked.role }
  );
  await createNotification({
    userId: revoked.user.id,
    type: "UNSHARED",
    message: `${await actorName(req)} removed your access to the folder “${folder.name}”`,
    resource: { type: "FOLDER", id: req.params.id },
    actorId: req.user!.id,
  });
  res.status(204).send();
});

export const getFolderAuditLog = asyncHandler(async (req: Request, res: Response) => {
  await requireFolderRole(req.user!.id, req.params.id, "EDITOR");
  const logs = await listAuditLogs("FOLDER", req.params.id);
  res.status(200).json({ logs });
});
