import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { getEffectiveDocumentRole, requireDocumentRole } from "./permission.service";

async function loadVisibleDocument(userId: string, documentId: string) {
  const document = await prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
  if (!document) {
    throw AppError.notFound("Document not found");
  }
  await requireDocumentRole(userId, document, "VIEWER");
  return document;
}

export function extractMentions(content: string): string[] {
  const matches = content.match(/@([a-zA-Z0-9._-]+)/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

/**
 * Resolve @mention tokens to real users who can actually see the document.
 * A token matches a user whose email local-part (before "@") equals it.
 * The commenter is excluded so self-mentions don't notify.
 */
export async function resolveMentionedUsers(
  tokens: string[],
  document: { ownerId: string; id: string; folderId: string | null },
  commenterId: string
): Promise<{ id: string; name: string; email: string }[]> {
  if (tokens.length === 0) return [];

  // Candidate users whose email local-part matches a token. Fetch a superset by
  // matching the token as a prefix of the email, then filter exactly in JS.
  const candidates = await prisma.user.findMany({
    where: {
      deactivatedAt: null,
      OR: tokens.map((t) => ({ email: { startsWith: `${t}@`, mode: "insensitive" as const } })),
    },
    select: { id: true, name: true, email: true },
  });

  const tokenSet = new Set(tokens);
  const matched = candidates.filter((u) => {
    const localPart = u.email.split("@")[0]?.toLowerCase();
    return localPart !== undefined && tokenSet.has(localPart) && u.id !== commenterId;
  });

  // Only notify users who have at least VIEWER access to the document.
  const visible: { id: string; name: string; email: string }[] = [];
  for (const user of matched) {
    const role = await getEffectiveDocumentRole(user.id, document);
    if (role) {
      visible.push(user);
    }
  }
  return visible;
}

export async function createComment(userId: string, documentId: string, content: string) {
  const document = await loadVisibleDocument(userId, documentId);
  await requireDocumentRole(userId, document, "COMMENTER");

  return prisma.comment.create({
    data: { documentId: document.id, userId, content },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export async function listComments(userId: string, documentId: string) {
  await loadVisibleDocument(userId, documentId);
  return prisma.comment.findMany({
    where: { documentId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function resolveComment(userId: string, documentId: string, commentId: string, resolved: boolean) {
  const document = await loadVisibleDocument(userId, documentId);
  const comment = await prisma.comment.findFirst({ where: { id: commentId, documentId: document.id } });
  if (!comment) {
    throw AppError.notFound("Comment not found");
  }
  if (comment.userId !== userId) {
    await requireDocumentRole(userId, document, "EDITOR");
  }

  return prisma.comment.update({
    where: { id: commentId },
    data: { resolved },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export async function deleteComment(userId: string, documentId: string, commentId: string) {
  const document = await loadVisibleDocument(userId, documentId);
  const comment = await prisma.comment.findFirst({ where: { id: commentId, documentId: document.id } });
  if (!comment) {
    throw AppError.notFound("Comment not found");
  }
  if (comment.userId !== userId) {
    await requireDocumentRole(userId, document, "OWNER");
  }
  await prisma.comment.delete({ where: { id: commentId } });
}
