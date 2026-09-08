import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  createComment,
  deleteComment,
  extractMentions,
  listComments,
  resolveComment,
  resolveMentionedUsers,
} from "../services/comment.service";
import { recordAuditLog } from "../services/audit.service";
import { createNotification } from "../services/notification.service";
import { broadcastToDocument } from "../realtime/socket";
import { prisma } from "../lib/prisma";

const PREVIEW_LENGTH = 80;

function ctx(req: Request) {
  return { userId: req.user!.id, ipAddress: req.ip ?? null };
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const comment = await createComment(req.user!.id, req.params.id, req.body.content);
  const mentions = extractMentions(req.body.content);
  const content: string = req.body.content;
  const preview = content.length > PREVIEW_LENGTH ? `${content.slice(0, PREVIEW_LENGTH)}…` : content;

  await recordAuditLog(ctx(req), "COMMENT", { type: "DOCUMENT", id: req.params.id }, { preview, mentions });
  broadcastToDocument(req.params.id, "comment:new", comment);

  // Notifications (best-effort). Fetch the document to resolve mentions against
  // real users with access and to notify the owner of a comment on their doc.
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, deletedAt: null },
    select: { id: true, name: true, ownerId: true, folderId: true },
  });
  if (document) {
    const actorName = comment.user.name;
    const mentioned = await resolveMentionedUsers(mentions, document, req.user!.id);
    const mentionedIds = new Set(mentioned.map((u) => u.id));

    for (const target of mentioned) {
      await createNotification({
        userId: target.id,
        type: "MENTIONED",
        message: `${actorName} mentioned you in a comment on “${document.name}”`,
        resource: { type: "DOCUMENT", id: document.id },
        actorId: req.user!.id,
      });
    }

    // Owner gets a comment notification too, unless they were already mentioned
    // or are the commenter (createNotification also guards the self case).
    if (document.ownerId !== req.user!.id && !mentionedIds.has(document.ownerId)) {
      await createNotification({
        userId: document.ownerId,
        type: "COMMENT_ON_OWNED",
        message: `${actorName} commented on your document “${document.name}”`,
        resource: { type: "DOCUMENT", id: document.id },
        actorId: req.user!.id,
      });
    }
  }

  res.status(201).json({ comment });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const comments = await listComments(req.user!.id, req.params.id);
  res.status(200).json({ comments });
});

export const resolve = asyncHandler(async (req: Request, res: Response) => {
  const comment = await resolveComment(req.user!.id, req.params.id, req.params.commentId, req.body.resolved);
  broadcastToDocument(req.params.id, "comment:updated", comment);
  res.status(200).json({ comment });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await deleteComment(req.user!.id, req.params.id, req.params.commentId);
  broadcastToDocument(req.params.id, "comment:deleted", { id: req.params.commentId });
  res.status(204).send();
});
