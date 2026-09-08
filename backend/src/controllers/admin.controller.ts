import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  listGlobalAuditLogs,
  listUsers,
  resetUserPassword,
  setUserActivation,
  setUserSystemRole,
} from "../services/admin.service";
import { recordAuditLog } from "../services/audit.service";
import type { ListAuditQuery, ListUsersQuery, ResetPasswordInput } from "../schemas/admin.schema";

function ctx(req: Request) {
  return { userId: req.user!.id, ipAddress: req.ip ?? null };
}

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { q, status, take, skip } = req.query as ListUsersQuery;
  const result = await listUsers({ q, status, take, skip });
  res.status(200).json(result);
});

export const updateUserRole = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.body as { role: "USER" | "ADMIN" };
  const user = await setUserSystemRole(req.user!.id, req.params.id, role);
  await recordAuditLog(
    ctx(req),
    role === "ADMIN" ? "PROMOTE" : "DEMOTE",
    undefined,
    { targetUserId: user.id, targetEmail: user.email, role }
  );
  res.status(200).json({ user });
});

export const updateUserActivation = asyncHandler(async (req: Request, res: Response) => {
  const { deactivated } = req.body as { deactivated: boolean };
  const user = await setUserActivation(req.user!.id, req.params.id, deactivated);
  await recordAuditLog(
    ctx(req),
    deactivated ? "DEACTIVATE" : "REACTIVATE",
    undefined,
    { targetUserId: user.id, targetEmail: user.email }
  );
  res.status(200).json({ user });
});

export const resetUserPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const { newPassword } = req.body as ResetPasswordInput;
  const { user, generatedPassword } = await resetUserPassword(req.params.id, newPassword);
  await recordAuditLog(
    ctx(req),
    "PASSWORD_RESET",
    undefined,
    { targetUserId: user.id, targetEmail: user.email, generated: generatedPassword !== null }
  );
  res.status(200).json({ user, generatedPassword });
});

export const getAuditLog = asyncHandler(async (req: Request, res: Response) => {
  const { userId, action, take, skip } = req.query as ListAuditQuery;
  const result = await listGlobalAuditLogs({ userId, action, take, skip });
  res.status(200).json(result);
});
