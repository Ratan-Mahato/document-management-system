import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../src/lib/jwt";

describe("jwt", () => {
  it("signs and verifies an access token round-trip", () => {
    const token = signAccessToken({ sub: "user-1", email: "a@example.com" });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.email).toBe("a@example.com");
  });

  it("signs and verifies a refresh token round-trip", () => {
    const token = signRefreshToken({ sub: "user-1", jti: "jti-1" });
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.jti).toBe("jti-1");
  });

  it("rejects an access token signed with the wrong secret", () => {
    const forged = jwt.sign({ sub: "user-1", email: "a@example.com" }, "some-other-secret-value-32-chars-min");
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it("rejects a refresh token presented as an access token (separate secrets)", () => {
    const refresh = signRefreshToken({ sub: "user-1", jti: "jti-1" });
    expect(() => verifyAccessToken(refresh)).toThrow();
  });

  it("rejects a malformed token", () => {
    expect(() => verifyAccessToken("not-a-jwt")).toThrow();
  });

  it("rejects an expired access token", () => {
    const expired = jwt.sign(
      { sub: "user-1", email: "a@example.com" },
      process.env.JWT_ACCESS_SECRET as string,
      { expiresIn: -10 }
    );
    expect(() => verifyAccessToken(expired)).toThrow();
  });
});
