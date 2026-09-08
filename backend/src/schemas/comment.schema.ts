import { z } from "zod";

export const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const resolveCommentSchema = z.object({
  resolved: z.boolean(),
});
export type ResolveCommentInput = z.infer<typeof resolveCommentSchema>;
