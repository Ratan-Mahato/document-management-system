import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    refreshToken: { updateMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async () => "hashed"),
    compare: vi.fn(),
  },
}));

// issueTokenPair (used by changePassword) signs tokens and writes a refreshToken row;
// stub the JWT layer so the service runs without real secrets.
vi.mock("../src/lib/jwt", () => ({
  signAccessToken: vi.fn(() => "access"),
  signRefreshToken: vi.fn(() => "refresh"),
  verifyRefreshToken: vi.fn(),
}));

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { resetUserPassword } from "../src/services/admin.service";
import { changePassword } from "../src/services/auth.service";

const userFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const userUpdate = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const refreshUpdateMany = prisma.refreshToken.updateMany as unknown as ReturnType<typeof vi.fn>;
const bcryptCompare = bcrypt.compare as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  userFindUnique.mockReset();
  userUpdate.mockReset();
  refreshUpdateMany.mockReset();
  bcryptCompare.mockReset();
});

describe("resetUserPassword (admin)", () => {
  it("throws 404 when the target user does not exist", async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(resetUserPassword("missing")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("generates a password when none is supplied and revokes sessions", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", email: "u1@x.com" });
    userUpdate.mockResolvedValue({ id: "u1" });
    const result = await resetUserPassword("u1");
    expect(typeof result.generatedPassword).toBe("string");
    expect(result.generatedPassword && result.generatedPassword.length).toBeGreaterThanOrEqual(8);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" }, data: { hashedPassword: "hashed" } })
    );
    expect(refreshUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", revokedAt: null } })
    );
  });

  it("does not echo an admin-supplied password back", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", email: "u1@x.com" });
    userUpdate.mockResolvedValue({ id: "u1" });
    const result = await resetUserPassword("u1", "chosen-password");
    expect(result.generatedPassword).toBeNull();
  });
});

describe("changePassword (self-service)", () => {
  it("rejects an incorrect current password", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", email: "u1@x.com", hashedPassword: "old", systemRole: "USER" });
    bcryptCompare.mockResolvedValue(false);
    await expect(changePassword("u1", "wrong", "new-password")).rejects.toMatchObject({
      code: "INVALID_CURRENT_PASSWORD",
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("updates the password and revokes other sessions on success", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", email: "u1@x.com", hashedPassword: "old", systemRole: "USER" });
    bcryptCompare.mockResolvedValue(true);
    userUpdate.mockResolvedValue({ id: "u1" });
    const tokens = await changePassword("u1", "correct", "new-password");
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" }, data: { hashedPassword: "hashed" } })
    );
    expect(refreshUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", revokedAt: null } })
    );
    expect(tokens).toMatchObject({ accessToken: "access", refreshToken: "refresh" });
  });
});
