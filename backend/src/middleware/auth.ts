import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { prisma } from "../lib/prisma";

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return next(AppError.unauthorized("Missing access token"));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, systemRole: payload.systemRole ?? "USER" };
    next();
  } catch {
    next(AppError.unauthorized("Invalid or expired access token"));
  }
}

// Gate admin-only routes. The access token carries systemRole, but it's short-lived
// and could be stale, so we confirm against the database: a user demoted or
// deactivated mid-session is refused immediately rather than at the next refresh.
export const requireAdmin = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { systemRole: true, deactivatedAt: true },
  });
  if (!user || user.deactivatedAt || user.systemRole !== "ADMIN") {
    throw AppError.forbidden("Administrator access required", "ADMIN_REQUIRED");
  }
  req.user.systemRole = "ADMIN";
  next();
});
