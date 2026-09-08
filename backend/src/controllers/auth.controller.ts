import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import {
  changePassword,
  loginUser,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../services/auth.service";
import { isProduction } from "../config/env";
import { prisma } from "../lib/prisma";
import { recordAuditLog } from "../services/audit.service";

const REFRESH_COOKIE_NAME = "dms_refresh_token";
const REFRESH_COOKIE_PATH = "/api/auth";

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

function toPublicUser(user: { id: string; name: string; email: string; systemRole: "USER" | "ADMIN" }) {
  return { id: user.id, name: user.name, email: user.email, systemRole: user.systemRole };
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { user, accessToken, refreshToken } = await registerUser(req.body);
  setRefreshCookie(res, refreshToken);
  await recordAuditLog({ userId: user.id, ipAddress: req.ip ?? null }, "REGISTER");
  res.status(201).json({ user: toPublicUser(user), accessToken });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { user, accessToken, refreshToken } = await loginUser(req.body);
  setRefreshCookie(res, refreshToken);
  await recordAuditLog({ userId: user.id, ipAddress: req.ip ?? null }, "LOGIN");
  res.status(200).json({ user: toPublicUser(user), accessToken });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    throw AppError.unauthorized("Missing refresh token");
  }
  const { user, accessToken, refreshToken } = await rotateRefreshToken(token);
  setRefreshCookie(res, refreshToken);
  res.status(200).json({ user: toPublicUser(user), accessToken });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (token) {
    const userId = await revokeRefreshToken(token);
    if (userId) {
      await recordAuditLog({ userId, ipAddress: req.ip ?? null }, "LOGOUT");
    }
  }
  clearRefreshCookie(res);
  res.status(204).send();
});

export const changeMyPassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };
  const { accessToken, refreshToken } = await changePassword(
    req.user!.id,
    currentPassword,
    newPassword
  );
  setRefreshCookie(res, refreshToken);
  await recordAuditLog({ userId: req.user!.id, ipAddress: req.ip ?? null }, "PASSWORD_CHANGE");
  res.status(200).json({ accessToken });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    throw AppError.unauthorized();
  }
  res.status(200).json({ user: toPublicUser(user) });
});
