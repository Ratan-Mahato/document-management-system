import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma singleton before importing the service under test.
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    folder: { findUnique: vi.fn() },
    permission: { findUnique: vi.fn() },
  },
}));

import { prisma } from "../src/lib/prisma";
import {
  getEffectiveFolderRole,
  getEffectiveDocumentRole,
  requireDocumentRole,
} from "../src/services/permission.service";

const folderFindUnique = prisma.folder.findUnique as unknown as ReturnType<typeof vi.fn>;
const permissionFindUnique = prisma.permission.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearMocks?.();
  folderFindUnique.mockReset();
  permissionFindUnique.mockReset();
});

describe("getEffectiveFolderRole", () => {
  it("returns null for a null folder (root)", async () => {
    expect(await getEffectiveFolderRole("user-1", null)).toBeNull();
  });

  it("returns OWNER when the user owns the folder", async () => {
    folderFindUnique.mockResolvedValue({ id: "f1", ownerId: "user-1", parentId: null });
    expect(await getEffectiveFolderRole("user-1", "f1")).toBe("OWNER");
  });

  it("returns an explicit grant on the folder itself", async () => {
    folderFindUnique.mockResolvedValue({ id: "f1", ownerId: "other", parentId: null });
    permissionFindUnique.mockResolvedValue({ role: "EDITOR" });
    expect(await getEffectiveFolderRole("user-1", "f1")).toBe("EDITOR");
  });

  it("inherits a role from an ancestor folder when the child has none", async () => {
    // child f2 (no grant) -> parent f1 (VIEWER grant)
    folderFindUnique
      .mockResolvedValueOnce({ id: "f2", ownerId: "other", parentId: "f1" })
      .mockResolvedValueOnce({ id: "f1", ownerId: "other", parentId: null });
    permissionFindUnique
      .mockResolvedValueOnce(null) // no grant on f2
      .mockResolvedValueOnce({ role: "VIEWER" }); // grant on f1
    expect(await getEffectiveFolderRole("user-1", "f2")).toBe("VIEWER");
  });

  it("prefers the highest-ranked grant found across the ancestor chain", async () => {
    // child f2 (VIEWER) -> parent f1 (OWNER-level EDITOR grant)
    folderFindUnique
      .mockResolvedValueOnce({ id: "f2", ownerId: "other", parentId: "f1" })
      .mockResolvedValueOnce({ id: "f1", ownerId: "other", parentId: null });
    permissionFindUnique
      .mockResolvedValueOnce({ role: "VIEWER" })
      .mockResolvedValueOnce({ role: "EDITOR" });
    expect(await getEffectiveFolderRole("user-1", "f2")).toBe("EDITOR");
  });

  it("returns null when no grant exists anywhere in the chain", async () => {
    folderFindUnique.mockResolvedValueOnce({ id: "f1", ownerId: "other", parentId: null });
    permissionFindUnique.mockResolvedValue(null);
    expect(await getEffectiveFolderRole("user-1", "f1")).toBeNull();
  });

  it("stops (returns null) when the folder does not exist", async () => {
    folderFindUnique.mockResolvedValue(null);
    expect(await getEffectiveFolderRole("user-1", "missing")).toBeNull();
  });
});

describe("getEffectiveDocumentRole", () => {
  it("returns OWNER when the user owns the document", async () => {
    const role = await getEffectiveDocumentRole("user-1", {
      ownerId: "user-1",
      id: "d1",
      folderId: null,
    });
    expect(role).toBe("OWNER");
  });

  it("uses a direct document grant when there is no folder", async () => {
    permissionFindUnique.mockResolvedValue({ role: "COMMENTER" });
    const role = await getEffectiveDocumentRole("user-1", {
      ownerId: "other",
      id: "d1",
      folderId: null,
    });
    expect(role).toBe("COMMENTER");
  });

  it("takes the higher of the direct grant and the inherited folder role", async () => {
    // direct document grant VIEWER, but folder inheritance gives EDITOR
    permissionFindUnique.mockResolvedValueOnce({ role: "VIEWER" }); // document grant
    folderFindUnique.mockResolvedValueOnce({ id: "f1", ownerId: "other", parentId: null });
    permissionFindUnique.mockResolvedValueOnce({ role: "EDITOR" }); // folder grant
    const role = await getEffectiveDocumentRole("user-1", {
      ownerId: "other",
      id: "d1",
      folderId: "f1",
    });
    expect(role).toBe("EDITOR");
  });

  it("returns null when the user has no access at all", async () => {
    permissionFindUnique.mockResolvedValue(null);
    folderFindUnique.mockResolvedValue(null);
    const role = await getEffectiveDocumentRole("user-1", {
      ownerId: "other",
      id: "d1",
      folderId: null,
    });
    expect(role).toBeNull();
  });
});

describe("requireDocumentRole", () => {
  it("throws a 403 when the user's effective role is insufficient", async () => {
    permissionFindUnique.mockResolvedValue({ role: "VIEWER" });
    await expect(
      requireDocumentRole("user-1", { ownerId: "other", id: "d1", folderId: null }, "EDITOR")
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("resolves when the user's effective role meets the requirement", async () => {
    permissionFindUnique.mockResolvedValue({ role: "EDITOR" });
    await expect(
      requireDocumentRole("user-1", { ownerId: "other", id: "d1", folderId: null }, "EDITOR")
    ).resolves.toBeUndefined();
  });

  it("always allows the owner", async () => {
    await expect(
      requireDocumentRole("user-1", { ownerId: "user-1", id: "d1", folderId: null }, "OWNER")
    ).resolves.toBeUndefined();
  });
});
