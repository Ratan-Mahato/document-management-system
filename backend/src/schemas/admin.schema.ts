import { z } from "zod";
import { AuditAction } from "@prisma/client";

export const listUsersQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  status: z.enum(["all", "active", "deactivated"]).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

export const setRoleSchema = z.object({
  role: z.enum(["USER", "ADMIN"]),
});

export const setActivationSchema = z.object({
  deactivated: z.boolean(),
});

// Optional explicit password; when omitted the server generates a strong one
// and returns it once so the admin can relay it out-of-band.
export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(128).optional(),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const listAuditQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.nativeEnum(AuditAction).optional(),
  take: z.coerce.number().int().min(1).max(500).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type SetRoleInput = z.infer<typeof setRoleSchema>;
export type SetActivationInput = z.infer<typeof setActivationSchema>;
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
