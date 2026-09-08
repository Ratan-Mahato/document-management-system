import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type ResourceType = "FOLDER" | "DOCUMENT";

export interface AuditContext {
  userId: string | null;
  ipAddress: string | null;
}

export async function recordAuditLog(
  ctx: AuditContext,
  action: AuditAction,
  resource?: { type: ResourceType; id: string },
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    // Round-trip through JSON so arbitrary metadata shapes (nested objects, unions
    // of string | null, etc.) always satisfy Prisma's InputJsonValue constraint.
    const safeMetadata: Prisma.InputJsonValue | undefined =
      metadata === undefined ? undefined : (JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue);

    await prisma.auditLog.create({
      data: {
        userId: ctx.userId,
        ipAddress: ctx.ipAddress,
        action,
        resourceType: resource?.type,
        resourceId: resource?.id,
        metadata: safeMetadata,
      },
    });
  } catch (err) {
    // Audit logging must never break the primary request flow.
    console.error("Failed to write audit log", err);
  }
}

export async function listAuditLogs(resourceType: ResourceType, resourceId: string) {
  return prisma.auditLog.findMany({
    where: { resourceType, resourceId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
