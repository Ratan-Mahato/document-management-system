import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/prisma", () => {
  const user = { findUnique: vi.fn(), create: vi.fn(), count: vi.fn() };
  const refreshToken = { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() };
  return {
    prisma: {
      user,
      refreshToken,
      // registerUser wraps the count + create in a transaction; run the callback
      // against the same mocked client so assertions see the create call.
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({ user, refreshToken })),
    },
  };
});

import { prisma } from "../src/lib/prisma";
import { registerUser, loginUser, rotateRefreshToken } from "../src/services/auth.service";
import { signRefreshToken } from "../src/lib/jwt";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const userFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const userCreate = prisma.user.create as unknown as ReturnType<typeof vi.fn>;
const userCount = prisma.user.count as unknown as ReturnType<typeof vi.fn>;
const rtCreate = prisma.refreshToken.create as unknown as ReturnType<typeof vi.fn>;
const rtFindUnique = prisma.refreshToken.findUnique as unknown as ReturnType<typeof vi.fn>;
const rtUpdate = prisma.refreshToken.update as unknown as ReturnType<typeof vi.fn>;

function sha256(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

beforeEach(() => {
  userFindUnique.mockReset();
  userCreate.mockReset();
  userCount.mockReset();
  rtCreate.mockReset();
  rtFindUnique.mockReset();
  rtUpdate.mockReset();
  rtCreate.mockResolvedValue({});
  userCount.mockResolvedValue(1); // default: not the first user
});

describe("registerUser", () => {
  it("rejects a duplicate email with a 409", async () => {
    userFindUnique.mockResolvedValue({ id: "existing" });
    await expect(
      registerUser({ name: "A", email: "a@example.com", password: "password123" })
    ).rejects.toMatchObject({ statusCode: 409, code: "EMAIL_TAKEN" });
  });

  it("hashes the password (never stores plaintext) and issues a token pair", async () => {
    userFindUnique.mockResolvedValue(null);
    userCreate.mockImplementation(async ({ data }: any) => ({ id: "u1", ...data }));

    const result = await registerUser({ name: "A", email: "a@example.com", password: "password123" });

    const createArg = userCreate.mock.calls[0][0].data;
    expect(createArg.hashedPassword).toBeDefined();
    expect(createArg.hashedPassword).not.toBe("password123");
    expect(await bcrypt.compare("password123", createArg.hashedPassword)).toBe(true);
    expect(result.accessToken).toBeTypeOf("string");
    expect(result.refreshToken).toBeTypeOf("string");
    // A refresh token row is persisted (hashed, not raw).
    expect(rtCreate).toHaveBeenCalledOnce();
    expect(rtCreate.mock.calls[0][0].data.tokenHash).not.toBe(result.refreshToken);
  });

  it("makes the very first registered user an ADMIN", async () => {
    userFindUnique.mockResolvedValue(null);
    userCount.mockResolvedValue(0); // no users yet
    userCreate.mockImplementation(async ({ data }: any) => ({ id: "u1", ...data }));

    await registerUser({ name: "First", email: "first@example.com", password: "password123" });

    expect(userCreate.mock.calls[0][0].data.systemRole).toBe("ADMIN");
  });

  it("makes subsequent registered users regular USERs", async () => {
    userFindUnique.mockResolvedValue(null);
    userCount.mockResolvedValue(5); // users already exist
    userCreate.mockImplementation(async ({ data }: any) => ({ id: "u2", ...data }));

    await registerUser({ name: "Second", email: "second@example.com", password: "password123" });

    expect(userCreate.mock.calls[0][0].data.systemRole).toBe("USER");
  });
});

describe("loginUser", () => {
  it("rejects an unknown email with a generic 401", async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(
      loginUser({ email: "nobody@example.com", password: "password123" })
    ).rejects.toMatchObject({ statusCode: 401, code: "INVALID_CREDENTIALS" });
  });

  it("rejects a wrong password with the same generic 401", async () => {
    const hashedPassword = await bcrypt.hash("correct-password", 12);
    userFindUnique.mockResolvedValue({ id: "u1", email: "a@example.com", hashedPassword });
    await expect(
      loginUser({ email: "a@example.com", password: "wrong-password" })
    ).rejects.toMatchObject({ statusCode: 401, code: "INVALID_CREDENTIALS" });
  });

  it("accepts correct credentials and issues tokens", async () => {
    const hashedPassword = await bcrypt.hash("correct-password", 12);
    userFindUnique.mockResolvedValue({ id: "u1", email: "a@example.com", hashedPassword });
    const result = await loginUser({ email: "a@example.com", password: "correct-password" });
    expect(result.accessToken).toBeTypeOf("string");
    expect(result.user.id).toBe("u1");
  });
});

describe("rotateRefreshToken", () => {
  it("rejects a token whose stored row was revoked", async () => {
    const token = signRefreshToken({ sub: "u1", jti: "jti-1" });
    rtFindUnique.mockResolvedValue({
      id: "jti-1",
      userId: "u1",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
      tokenHash: sha256(token),
    });
    await expect(rotateRefreshToken(token)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects a token whose hash does not match the stored row (tamper/replay)", async () => {
    const token = signRefreshToken({ sub: "u1", jti: "jti-1" });
    rtFindUnique.mockResolvedValue({
      id: "jti-1",
      userId: "u1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
      tokenHash: sha256("a-different-token"),
    });
    await expect(rotateRefreshToken(token)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects a syntactically invalid token", async () => {
    await expect(rotateRefreshToken("garbage")).rejects.toMatchObject({ statusCode: 401 });
  });

  it("revokes the old token and issues a new pair on a valid rotation", async () => {
    const token = signRefreshToken({ sub: "u1", jti: "jti-1" });
    rtFindUnique.mockResolvedValue({
      id: "jti-1",
      userId: "u1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
      tokenHash: sha256(token),
    });
    userFindUnique.mockResolvedValue({ id: "u1", email: "a@example.com" });
    rtUpdate.mockResolvedValue({});

    const result = await rotateRefreshToken(token);

    // Old token row is revoked...
    expect(rtUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "jti-1" }, data: expect.objectContaining({ revokedAt: expect.any(Date) }) })
    );
    // ...and a fresh pair is returned.
    expect(result.accessToken).toBeTypeOf("string");
    expect(result.refreshToken).not.toBe(token);
  });
});
