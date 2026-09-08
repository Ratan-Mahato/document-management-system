import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  addDocumentVersion,
  createDocument,
  getDocument,
  getDocumentDownloadUrl,
  getDocumentPreviewUrl,
  getVersionDownloadUrl,
  getVersionTextContent,
  listDeletedDocuments,
  listDocumentVersions,
  listDocuments,
  presignDocumentUpload,
  presignNewVersionUpload,
  restoreDocument,
  softDeleteDocument,
  updateDocument,
} from "../services/document.service";
import {
  grantPermission,
  listPermissions,
  requireDocumentRole,
  revokePermission,
} from "../services/permission.service";
import { listAuditLogs, recordAuditLog } from "../services/audit.service";
import { createNotification } from "../services/notification.service";
import { prisma } from "../lib/prisma";
import type { ListDocumentsQuery } from "../schemas/document.schema";

function ctx(req: Request) {
  return { userId: req.user!.id, ipAddress: req.ip ?? null };
}

// The access token carries id/email but not the display name; look it up for
// human-readable notification messages ("<name> shared … with you").
async function actorName(req: Request): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { name: true },
  });
  return user?.name ?? req.user!.email;
}

export const presignUpload = asyncHandler(async (req: Request, res: Response) => {
  const folderId = (req.body.folderId as string | undefined) ?? null;
  const result = await presignDocumentUpload(req.user!.id, folderId, req.body);
  res.status(200).json(result);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const document = await createDocument(req.user!.id, req.body);
  await recordAuditLog(ctx(req), "CREATE", { type: "DOCUMENT", id: document.id }, { name: document.name });
  res.status(201).json({ document });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const documents = await listDocuments(req.user!.id, req.query as ListDocumentsQuery);
  res.status(200).json({ documents });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const document = await getDocument(req.user!.id, req.params.id);
  await recordAuditLog(ctx(req), "VIEW", { type: "DOCUMENT", id: document.id }, { name: document.name });
  res.status(200).json({ document });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { document, changes } = await updateDocument(req.user!.id, req.params.id, req.body);
  if (Object.keys(changes).length > 0) {
    await recordAuditLog(ctx(req), "UPDATE", { type: "DOCUMENT", id: document.id }, { name: document.name, changes });
  }
  res.status(200).json({ document });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const document = await softDeleteDocument(req.user!.id, req.params.id);
  await recordAuditLog(ctx(req), "DELETE", { type: "DOCUMENT", id: req.params.id }, { name: document.name });
  res.status(204).send();
});

export const listTrash = asyncHandler(async (req: Request, res: Response) => {
  const documents = await listDeletedDocuments(req.user!.id);
  res.status(200).json({ documents });
});

export const restore = asyncHandler(async (req: Request, res: Response) => {
  const document = await restoreDocument(req.user!.id, req.params.id);
  await recordAuditLog(ctx(req), "RESTORE", { type: "DOCUMENT", id: document.id }, { name: document.name });
  res.status(200).json({ document });
});

export const getDownloadUrl = asyncHandler(async (req: Request, res: Response) => {
  const result = await getDocumentDownloadUrl(req.user!.id, req.params.id);
  await recordAuditLog(
    ctx(req),
    "DOWNLOAD",
    { type: "DOCUMENT", id: req.params.id },
    { name: result.name, versionNumber: result.versionNumber }
  );
  res.status(200).json({ url: result.url, expiresInSeconds: result.expiresInSeconds });
});

export const getPreviewUrl = asyncHandler(async (req: Request, res: Response) => {
  const result = await getDocumentPreviewUrl(req.user!.id, req.params.id);
  res.status(200).json(result);
});

// --- Versions ---

export const presignVersionUpload = asyncHandler(async (req: Request, res: Response) => {
  const result = await presignNewVersionUpload(req.user!.id, req.params.id, req.body);
  res.status(200).json(result);
});

export const createVersion = asyncHandler(async (req: Request, res: Response) => {
  const document = await addDocumentVersion(req.user!.id, req.params.id, req.body);
  await recordAuditLog(
    ctx(req),
    "UPLOAD_VERSION",
    { type: "DOCUMENT", id: req.params.id },
    { name: document.name, versionNumber: document.currentVersion?.versionNumber }
  );
  res.status(201).json({ document });
});

export const listVersions = asyncHandler(async (req: Request, res: Response) => {
  const versions = await listDocumentVersions(req.user!.id, req.params.id);
  res.status(200).json({ versions });
});

export const getVersionDownload = asyncHandler(async (req: Request, res: Response) => {
  const result = await getVersionDownloadUrl(req.user!.id, req.params.id, req.params.versionId);
  await recordAuditLog(
    ctx(req),
    "DOWNLOAD",
    { type: "DOCUMENT", id: req.params.id },
    { name: result.name, versionNumber: result.versionNumber }
  );
  res.status(200).json({ url: result.url, expiresInSeconds: result.expiresInSeconds });
});

export const getVersionText = asyncHandler(async (req: Request, res: Response) => {
  const text = await getVersionTextContent(req.user!.id, req.params.id, req.params.versionId);
  res.status(200).json({ text });
});

// --- Permissions ---

async function requireDocOwnerAccess(userId: string, documentId: string) {
  const document = await getDocument(userId, documentId);
  await requireDocumentRole(userId, document, "OWNER");
  return document;
}

export const grantDocumentPermission = asyncHandler(async (req: Request, res: Response) => {
  const document = await requireDocOwnerAccess(req.user!.id, req.params.id);
  const { userId, role } = req.body;
  const permission = await grantPermission(req.user!.id, "DOCUMENT", req.params.id, userId, role);
  await recordAuditLog(
    ctx(req),
    "SHARE",
    { type: "DOCUMENT", id: req.params.id },
    { documentName: document.name, targetName: permission.user.name, targetEmail: permission.user.email, role }
  );
  await createNotification({
    userId: permission.user.id,
    type: "SHARED",
    message: `${await actorName(req)} shared the document “${document.name}” with you as ${role}`,
    resource: { type: "DOCUMENT", id: req.params.id },
    actorId: req.user!.id,
  });
  res.status(201).json({ permission });
});

export const listDocumentPermissions = asyncHandler(async (req: Request, res: Response) => {
  const document = await getDocument(req.user!.id, req.params.id);
  await requireDocumentRole(req.user!.id, document, "EDITOR");
  const permissions = await listPermissions("DOCUMENT", req.params.id);
  res.status(200).json({ permissions });
});

export const revokeDocumentPermission = asyncHandler(async (req: Request, res: Response) => {
  const document = await requireDocOwnerAccess(req.user!.id, req.params.id);
  const revoked = await revokePermission("DOCUMENT", req.params.id, req.params.permissionId);
  await recordAuditLog(
    ctx(req),
    "UNSHARE",
    { type: "DOCUMENT", id: req.params.id },
    { documentName: document.name, targetName: revoked.user.name, targetEmail: revoked.user.email, priorRole: revoked.role }
  );
  await createNotification({
    userId: revoked.user.id,
    type: "UNSHARED",
    message: `${await actorName(req)} removed your access to the document “${document.name}”`,
    resource: { type: "DOCUMENT", id: req.params.id },
    actorId: req.user!.id,
  });
  res.status(204).send();
});

// --- Audit log ---

export const getDocumentAuditLog = asyncHandler(async (req: Request, res: Response) => {
  const document = await getDocument(req.user!.id, req.params.id);
  await requireDocumentRole(req.user!.id, document, "EDITOR");
  const logs = await listAuditLogs("DOCUMENT", req.params.id);
  res.status(200).json({ logs });
});
