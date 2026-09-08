import { z } from "zod";

export const createFolderSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  parentId: z.string().uuid().nullable().optional(),
});
export type CreateFolderInput = z.infer<typeof createFolderSchema>;

export const updateFolderSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  parentId: z.string().uuid().nullable().optional(),
});
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;

export const listFoldersQuerySchema = z.object({
  parentId: z.string().uuid().optional(),
});
