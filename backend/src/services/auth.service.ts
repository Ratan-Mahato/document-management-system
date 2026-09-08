import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/jwt";
import { RegisterInput, LoginInput } from "../schemas/auth.schema";

const SALT_ROUNDS = 12;

function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function refreshTtlToDate(): Date {
  const days = 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function issueTokenPair(userId: string, email: string, systemRole: "USER" | "ADMIN") {
  const accessToken = signAccessToken({ sub: userId, email, systemRole });
  const jti = crypto.randomUUID();
  const refreshToken = signRefreshToken({ sub: userId, jti });

  await prisma.refreshToken.create({
    data: {
      id: jti,
      tokenHash: hashRefreshToken(refreshToken),
      userId,
      expiresAt: refreshTtlToDate(),
    },
  });

  return { accessToken, refreshToken };
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw AppError.conflict("An account with this email already exists", "EMAIL_TAKEN");
  }

  const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);

  // The very first account to register bootstraps the system as its administrator,
  // so a fresh install has an admin without needing the CLI. Every later account
  // defaults to USER. Done in a transaction so two concurrent first-registrations
  // can't both claim admin.
  const user = await prisma.$transaction(async (tx) => {
    const userCount = await tx.user.count();
    return tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        hashedPassword,
        systemRole: userCount === 0 ? "ADMIN" : "USER",
      },
    });
  });

  const tokens = await issueTokenPair(user.id, user.email, user.systemRole);
  return { user, ...tokens };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw AppError.unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }

  const valid = await bcrypt.compare(input.password, user.hashedPassword);
  if (!valid) {
    throw AppError.unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }

  if (user.deactivatedAt) {
    throw AppError.forbidden("This account has been deactivated", "ACCOUNT_DEACTIVATED");
  }

  const tokens = await issueTokenPair(user.id, user.email, user.systemRole);
  return { user, ...tokens };
}

export async function rotateRefreshToken(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw AppError.unauthorized("Invalid or expired refresh token");
  }

  const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
  if (
    !stored ||
    stored.revokedAt ||
    stored.expiresAt < new Date() ||
    stored.tokenHash !== hashRefreshToken(refreshToken)
  ) {
    throw AppError.unauthorized("Invalid or expired refresh token");
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) {
    throw AppError.unauthorized("Invalid or expired refresh token");
  }

  if (user.deactivatedAt) {
    // Deactivated mid-session: revoke the token and refuse to reissue.
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    throw AppError.forbidden("This account has been deactivated", "ACCOUNT_DEACTIVATED");
  }

  // Rotate: revoke the used token and issue a new pair (mitigates replay).
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const tokens = await issueTokenPair(user.id, user.email, user.systemRole);
  return { user, ...tokens };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw AppError.unauthorized();
  }

  const valid = await bcrypt.compare(currentPassword, user.hashedPassword);
  if (!valid) {
    throw AppError.badRequest("Current password is incorrect", "INVALID_CURRENT_PASSWORD");
  }

  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { hashedPassword } });

  // End every other session by revoking all outstanding refresh tokens. The
  // caller is reissued a fresh pair by the controller so they stay logged in here.
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return issueTokenPair(user.id, user.email, user.systemRole);
}

export async function revokeRefreshToken(refreshToken: string): Promise<string | null> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return payload.sub;
  } catch {
    // Token already invalid/expired: nothing to revoke.
    return null;
  }
}
