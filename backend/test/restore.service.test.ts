import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma singleton before importing the services under test.
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    document: { findFirst: vi.fn(), update: vi.fn() },
    folder: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

// permission.service is imported transitively by document.service / folder.service;
// restore paths don't call into it, but the module must resolve.
vi.mock("../src/lib/s3", () => ({
  buildObjectKey: vi.fn(),
  getObjectText: vi.fn(),
  getPresignedDownloadUrl: vi.fn(),
  getPresignedUploadUrl: vi.fn(),
}));

import { prisma } from "../src/lib/prisma";
import { restoreDocument } from "../src/services/document.service";
import { restoreFolder } from "../src/services/folder.service";

const docFindFirst = prisma.document.findFirst as unknown as ReturnType<typeof vi.fn>;
const docUpdate = prisma.document.update as unknown as ReturnType<typeof vi.fn>;
const folderFindFirst = prisma.folder.findFirst as unknown as ReturnType<typeof vi.fn>;
const folderUpdate = prisma.folder.update as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  docFindFirst.mockReset();
  docUpdate.mockReset();
  folderFindFirst.mockReset();
  folderUpdate.mockReset();
});

describe("restoreDocument", () => {
  it("throws 404 when the deleted document does not exist", async () => {
    docFindFirst.mockResolvedValue(null);
    await expect(restoreDocument("user-1", "missing")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 403 when the requester is not the owner", async () => {
    docFindFirst.mockResolvedValue({ id: "d1", ownerId: "other", folderId: null, deletedAt: new Date() });
    await expect(restoreDocument("user-1", "d1")).rejects.toMatchObject({ statusCode: 403 });
    expect(docUpdate).not.toHaveBeenCalled();
  });

  it("restores in place when the parent folder still exists", async () => {
    docFindFirst.mockResolvedValue({ id: "d1", ownerId: "user-1", folderId: "f1", deletedAt: new Date() });
    folderFindFirst.mockResolvedValue({ id: "f1", deletedAt: null });
    docUpdate.mockResolvedValue({ id: "d1" });

    await restoreDocument("user-1", "d1");

    expect(docUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: null, folderId: "f1" }) })
    );
  });

  it("detaches to root when the parent folder is still deleted", async () => {
    docFindFirst.mockResolvedValue({ id: "d1", ownerId: "user-1", folderId: "f1", deletedAt: new Date() });
    folderFindFirst.mockResolvedValue(null); // folder not found among non-deleted
    docUpdate.mockResolvedValue({ id: "d1" });

    await restoreDocument("user-1", "d1");

    expect(docUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: null, folderId: null }) })
    );
  });
});

describe("restoreFolder", () => {
  it("throws 404 when the deleted folder does not exist", async () => {
    folderFindFirst.mockResolvedValue(null);
    await expect(restoreFolder("user-1", "missing")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 403 when the requester is not the owner", async () => {
    folderFindFirst.mockResolvedValue({ id: "f1", ownerId: "other", parentId: null, deletedAt: new Date() });
    await expect(restoreFolder("user-1", "f1")).rejects.toMatchObject({ statusCode: 403 });
    expect(folderUpdate).not.toHaveBeenCalled();
  });

  it("restores in place when the parent folder still exists", async () => {
    folderFindFirst
      .mockResolvedValueOnce({ id: "f2", ownerId: "user-1", parentId: "f1", deletedAt: new Date() }) // the folder
      .mockResolvedValueOnce({ id: "f1", deletedAt: null }); // parent lookup
    folderUpdate.mockResolvedValue({ id: "f2" });

    await restoreFolder("user-1", "f2");

    expect(folderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: null, parentId: "f1" }) })
    );
  });

  it("restores to root when the parent folder is still deleted", async () => {
    folderFindFirst
      .mockResolvedValueOnce({ id: "f2", ownerId: "user-1", parentId: "f1", deletedAt: new Date() }) // the folder
      .mockResolvedValueOnce(null); // parent lookup among non-deleted -> gone
    folderUpdate.mockResolvedValue({ id: "f2" });

    await restoreFolder("user-1", "f2");

    expect(folderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: null, parentId: null }) })
    );
  });
});
