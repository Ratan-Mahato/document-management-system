import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
  },
}));

import { prisma } from "../src/lib/prisma";
import { setUserSystemRole, setUserActivation } from "../src/services/admin.service";

const userFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const userUpdate = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const userCount = prisma.user.count as unknown as ReturnType<typeof vi.fn>;
const refreshUpdateMany = prisma.refreshToken.updateMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  userFindUnique.mockReset();
  userUpdate.mockReset();
  userCount.mockReset();
  refreshUpdateMany.mockReset();
});

describe("setUserSystemRole", () => {
  it("throws 404 when the target user does not exist", async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(setUserSystemRole("admin-1", "missing", "ADMIN")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses to let an admin demote themselves", async () => {
    userFindUnique.mockResolvedValue({ id: "admin-1", systemRole: "ADMIN", deactivatedAt: null });
    await expect(setUserSystemRole("admin-1", "admin-1", "USER")).rejects.toMatchObject({
      code: "CANNOT_DEMOTE_SELF",
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("refuses to demote the last remaining admin", async () => {
    userFindUnique.mockResolvedValue({ id: "admin-2", systemRole: "ADMIN", deactivatedAt: null });
    userCount.mockResolvedValue(1);
    await expect(setUserSystemRole("admin-1", "admin-2", "USER")).rejects.toMatchObject({ code: "LAST_ADMIN" });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("promotes a regular user to admin", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", systemRole: "USER", deactivatedAt: null });
    userUpdate.mockResolvedValue({ id: "u1", systemRole: "ADMIN" });
    await setUserSystemRole("admin-1", "u1", "ADMIN");
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" }, data: { systemRole: "ADMIN" } })
    );
  });

  it("is a no-op when the user already has the requested role", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", systemRole: "ADMIN", deactivatedAt: null });
    const result = await setUserSystemRole("admin-1", "u1", "ADMIN");
    expect(userUpdate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "u1", systemRole: "ADMIN" });
  });

  it("demotes a non-last admin when others remain", async () => {
    userFindUnique.mockResolvedValue({ id: "admin-2", systemRole: "ADMIN", deactivatedAt: null });
    userCount.mockResolvedValue(3);
    userUpdate.mockResolvedValue({ id: "admin-2", systemRole: "USER" });
    await setUserSystemRole("admin-1", "admin-2", "USER");
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "admin-2" }, data: { systemRole: "USER" } })
    );
  });
});

describe("setUserActivation", () => {
  it("refuses to let an admin deactivate themselves", async () => {
    userFindUnique.mockResolvedValue({ id: "admin-1", systemRole: "ADMIN", deactivatedAt: null });
    await expect(setUserActivation("admin-1", "admin-1", true)).rejects.toMatchObject({
      code: "CANNOT_DEACTIVATE_SELF",
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("refuses to deactivate the last active admin", async () => {
    userFindUnique.mockResolvedValue({ id: "admin-2", systemRole: "ADMIN", deactivatedAt: null });
    userCount.mockResolvedValue(1);
    await expect(setUserActivation("admin-1", "admin-2", true)).rejects.toMatchObject({ code: "LAST_ADMIN" });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("deactivates a user and revokes their sessions", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", systemRole: "USER", deactivatedAt: null });
    userUpdate.mockResolvedValue({ id: "u1", deactivatedAt: new Date() });
    await setUserActivation("admin-1", "u1", true);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" }, data: expect.objectContaining({ deactivatedAt: expect.any(Date) }) })
    );
    expect(refreshUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", revokedAt: null } })
    );
  });

  it("reactivates a deactivated user without revoking sessions", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", systemRole: "USER", deactivatedAt: new Date() });
    userUpdate.mockResolvedValue({ id: "u1", deactivatedAt: null });
    await setUserActivation("admin-1", "u1", false);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" }, data: { deactivatedAt: null } })
    );
    expect(refreshUpdateMany).not.toHaveBeenCalled();
  });

  it("is a no-op when the user is already in the requested state", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", systemRole: "USER", deactivatedAt: null });
    await setUserActivation("admin-1", "u1", false);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
