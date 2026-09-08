import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import {
  buildObjectKey,
  getObjectText,
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
} from "../lib/s3";
import {
  AddVersionInput,
  CreateDocumentInput,
  ListDocumentsQuery,
  PresignUploadInput,
  UpdateDocumentInput,
} from "../schemas/document.schema";
import { requireDocumentRole, requireFolderRole } from "./permission.service";

const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_EXACT = new Set(["application/json", "application/xml"]);

function isTextMimeType(mimeType: string): boolean {
  return TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) || TEXT_MIME_EXACT.has(mimeType);
}

const PREVIEWABLE_MIME_PREFIXES = ["image/", "video/", "audio/", "text/"];
const PREVIEWABLE_MIME_EXACT = new Set(["application/pdf", "application/json", "application/xml"]);

function isPreviewableMimeType(mimeType: string): boolean {
  return PREVIEWABLE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) || PREVIEWABLE_MIME_EXACT.has(mimeType);
}

async function extractTextIfApplicable(s3Key: string, mimeType: string): Promise<string | null> {
  if (!isTextMimeType(mimeType)) return null;
  return getObjectText(s3Key);
}

function toTsQuery(q: string): string | null {
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

export async function presignDocumentUpload(userId: string, folderId: string | null, input: PresignUploadInput) {
  if (folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: folderId, deletedAt: null } });
    if (!folder) {
      throw AppError.notFound("Folder not found");
    }
    await requireFolderRole(userId, folderId, "EDITOR");
  }

  const s3Key = buildObjectKey(userId, input.fileName);
  const uploadUrl = await getPresignedUploadUrl(s3Key, input.mimeType);

  return { uploadUrl, s3Key };
}

export async function createDocument(userId: string, input: CreateDocumentInput) {
  if (input.folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: input.folderId, deletedAt: null } });
    if (!folder) {
      throw AppError.notFound("Folder not found");
    }
    await requireFolderRole(userId, input.folderId, "EDITOR");
  }

  const extractedText = await extractTextIfApplicable(input.s3Key, input.mimeType);

  return prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        name: input.name,
        ownerId: userId,
        folderId: input.folderId ?? null,
        tags: input.tags,
        extractedText,
      },
    });

    const version = await tx.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        s3Key: input.s3Key,
        size: input.size,
        mimeType: input.mimeType,
        createdById: userId,
      },
    });

    return tx.document.update({
      where: { id: document.id },
      data: { currentVersionId: version.id },
      include: { currentVersion: true },
    });
  });
}

export async function presignNewVersionUpload(userId: string, documentId: string, input: PresignUploadInput) {
  const document = await findOwnedOrVisibleDocument(userId, documentId);
  await requireDocumentRole(userId, document, "EDITOR");

  const s3Key = buildObjectKey(userId, input.fileName);
  const uploadUrl = await getPresignedUploadUrl(s3Key, input.mimeType);
  return { uploadUrl, s3Key };
}

export async function addDocumentVersion(userId: string, documentId: string, input: AddVersionInput) {
  const document = await findOwnedOrVisibleDocument(userId, documentId);
  await requireDocumentRole(userId, document, "EDITOR");

  const latest = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;

  const extractedText = await extractTextIfApplicable(input.s3Key, input.mimeType);

  return prisma.$transaction(async (tx) => {
    const version = await tx.documentVersion.create({
      data: {
        documentId,
        versionNumber: nextVersionNumber,
        s3Key: input.s3Key,
        size: input.size,
        mimeType: input.mimeType,
        createdById: userId,
      },
    });

    return tx.document.update({
      where: { id: documentId },
      data: { currentVersionId: version.id, extractedText },
      include: { currentVersion: true },
    });
  });
}

export async function listDocumentVersions(userId: string, documentId: string) {
  const document = await findOwnedOrVisibleDocument(userId, documentId);
  return prisma.documentVersion.findMany({
    where: { documentId: document.id },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
    orderBy: { versionNumber: "desc" },
  });
}

export async function getVersionDownloadUrl(userId: string, documentId: string, versionId: string) {
  const document = await findOwnedOrVisibleDocument(userId, documentId);
  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId: document.id },
  });
  if (!version) {
    throw AppError.notFound("Version not found");
  }
  const url = await getPresignedDownloadUrl(version.s3Key, `${document.name} (v${version.versionNumber})`);
  return { url, expiresInSeconds: 300, name: document.name, versionNumber: version.versionNumber };
}

export async function getVersionTextContent(userId: string, documentId: string, versionId: string): Promise<string> {
  const document = await findOwnedOrVisibleDocument(userId, documentId);
  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId: document.id },
  });
  if (!version) {
    throw AppError.notFound("Version not found");
  }
  if (!isTextMimeType(version.mimeType)) {
    throw AppError.badRequest("Only text-based versions can be diffed");
  }
  const text = await getObjectText(version.s3Key);
  return text ?? "";
}

async function findOwnedOrVisibleDocument(userId: string, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    include: { currentVersion: true },
  });
  if (!document) {
    throw AppError.notFound("Document not found");
  }
  await requireDocumentRole(userId, document, "VIEWER");
  return document;
}

export async function getDocument(userId: string, documentId: string) {
  return findOwnedOrVisibleDocument(userId, documentId);
}

export async function listDocuments(userId: string, filters: ListDocumentsQuery) {
  if (filters.folderId) {
    await requireFolderRole(userId, filters.folderId, "VIEWER");
  }

  // Plain browsing (no search/filter criteria) defaults to the current folder only,
  // like a file explorer. Any search/filter criteria broadens the scope to every
  // folder the user can see, unless a folderId was explicitly requested too.
  const hasSearchCriteria = Boolean(
    filters.q || filters.tag || filters.ownerId || filters.mimeType || filters.updatedAfter || filters.updatedBefore
  );
  const folderIdFilter = filters.folderId ?? (hasSearchCriteria ? undefined : null);

  const tsQuery = filters.q ? toTsQuery(filters.q) : null;

  const documents = await prisma.document.findMany({
    where: {
      deletedAt: null,
      folderId: folderIdFilter,
      ownerId: filters.ownerId,
      tags: filters.tag ? { has: filters.tag } : undefined,
      currentVersion: filters.mimeType ? { mimeType: { startsWith: filters.mimeType } } : undefined,
      updatedAt:
        filters.updatedAfter || filters.updatedBefore
          ? {
              gte: filters.updatedAfter ? new Date(filters.updatedAfter) : undefined,
              lte: filters.updatedBefore ? new Date(filters.updatedBefore) : undefined,
            }
          : undefined,
      ...(tsQuery ? { OR: [{ name: { search: tsQuery } }, { extractedText: { search: tsQuery } }] } : {}),
    },
    include: { currentVersion: true },
    orderBy: { updatedAt: "desc" },
  });

  const visible = [];
  for (const doc of documents) {
    if (doc.ownerId === userId) {
      visible.push(doc);
      continue;
    }
    try {
      await requireDocumentRole(userId, doc, "VIEWER");
      visible.push(doc);
    } catch {
      // not visible to this user
    }
  }
  return visible;
}

export interface FieldChange {
  from: unknown;
  to: unknown;
}

export async function updateDocument(userId: string, documentId: string, input: UpdateDocumentInput) {
  const document = await findOwnedOrVisibleDocument(userId, documentId);
  await requireDocumentRole(userId, document, "EDITOR");

  let destinationFolderName: string | null = null;
  if (input.folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: input.folderId, deletedAt: null } });
    if (!folder) {
      throw AppError.notFound("Destination folder not found");
    }
    await requireFolderRole(userId, input.folderId, "EDITOR");
    destinationFolderName = folder.name;
  }

  const changes: Record<string, FieldChange> = {};
  if (input.name !== undefined && input.name !== document.name) {
    changes.name = { from: document.name, to: input.name };
  }
  if (input.folderId !== undefined && input.folderId !== document.folderId) {
    changes.folder = { from: document.folderId ? { id: document.folderId } : null, to: destinationFolderName ? { id: input.folderId, name: destinationFolderName } : null };
  }
  if (input.tags !== undefined && JSON.stringify([...input.tags].sort()) !== JSON.stringify([...document.tags].sort())) {
    changes.tags = { from: document.tags, to: input.tags };
  }

  const updated = await prisma.document.update({
    where: { id: documentId },
    data: {
      name: input.name,
      tags: input.tags,
      folderId: input.folderId === undefined ? undefined : input.folderId,
    },
    include: { currentVersion: true },
  });

  return { document: updated, changes };
}

export async function softDeleteDocument(userId: string, documentId: string) {
  const document = await findOwnedOrVisibleDocument(userId, documentId);
  await requireDocumentRole(userId, document, "OWNER");

  return prisma.document.update({
    where: { id: documentId },
    data: { deletedAt: new Date() },
  });
}

export async function listDeletedDocuments(userId: string) {
  // Trash is owner-scoped: you can only see and restore documents you own.
  // (Soft-delete itself requires OWNER, so this mirrors that boundary.)
  return prisma.document.findMany({
    where: { ownerId: userId, deletedAt: { not: null } },
    include: { currentVersion: true },
    orderBy: { deletedAt: "desc" },
  });
}

export async function restoreDocument(userId: string, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: { not: null } },
  });
  if (!document) {
    throw AppError.notFound("Deleted document not found");
  }
  if (document.ownerId !== userId) {
    throw AppError.forbidden("Only the owner can restore this document");
  }

  // If the document's folder is itself deleted, restoring the document into it
  // would hide it in a deleted folder. Detach it to the root in that case.
  let folderId = document.folderId;
  if (folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: folderId, deletedAt: null } });
    if (!folder) folderId = null;
  }

  return prisma.document.update({
    where: { id: documentId },
    data: { deletedAt: null, folderId },
    include: { currentVersion: true },
  });
}

export async function getDocumentDownloadUrl(userId: string, documentId: string) {
  const document = await findOwnedOrVisibleDocument(userId, documentId);
  if (!document.currentVersion) {
    throw AppError.notFound("Document has no uploaded content yet");
  }
  const url = await getPresignedDownloadUrl(document.currentVersion.s3Key, document.name);
  return { url, expiresInSeconds: 300, name: document.name, versionNumber: document.currentVersion.versionNumber };
}

export async function getDocumentPreviewUrl(userId: string, documentId: string) {
  const document = await findOwnedOrVisibleDocument(userId, documentId);
  if (!document.currentVersion) {
    throw AppError.notFound("Document has no uploaded content yet");
  }
  if (!isPreviewableMimeType(document.currentVersion.mimeType)) {
    throw AppError.badRequest("This file type can't be previewed inline", "NOT_PREVIEWABLE");
  }
  const url = await getPresignedDownloadUrl(document.currentVersion.s3Key, document.name, "inline");
  return { url, expiresInSeconds: 300, mimeType: document.currentVersion.mimeType };
}
