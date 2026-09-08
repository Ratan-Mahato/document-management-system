import { z } from "zod";

export const presignUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  size: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024 * 1024, "File exceeds 5GB limit"),
  folderId: z.string().uuid().nullable().optional(),
});
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const createDocumentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  s3Key: z.string().trim().min(1),
  size: z.number().int().positive(),
  mimeType: z.string().trim().min(1).max(255),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const updateDocumentSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
});
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const addVersionSchema = z.object({
  s3Key: z.string().trim().min(1),
  size: z.number().int().positive(),
  mimeType: z.string().trim().min(1).max(255),
});
export type AddVersionInput = z.infer<typeof addVersionSchema>;

export const listDocumentsQuerySchema = z.object({
  folderId: z.string().uuid().optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  mimeType: z.string().optional(),
  updatedAfter: z.string().datetime().optional(),
  updatedBefore: z.string().datetime().optional(),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

export const grantPermissionSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["OWNER", "EDITOR", "COMMENTER", "VIEWER"]),
});
export type GrantPermissionInput = z.infer<typeof grantPermissionSchema>;
