import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../src/realtime/socket", () => ({
  emitToUser: vi.fn(),
}));

import { prisma } from "../src/lib/prisma";
import { emitToUser } from "../src/realtime/socket";
import {
  createNotification,
  listNotifications,
  markRead,
  markAllRead,
} from "../src/services/notification.service";

const create = prisma.notification.create as unknown as ReturnType<typeof vi.fn>;
const findMany = prisma.notification.findMany as unknown as ReturnType<typeof vi.fn>;
const count = prisma.notification.count as unknown as ReturnType<typeof vi.fn>;
const updateMany = prisma.notification.updateMany as unknown as ReturnType<typeof vi.fn>;
const emit = emitToUser as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  create.mockReset();
  findMany.mockReset();
  count.mockReset();
  updateMany.mockReset();
  emit.mockReset();
});

describe("createNotification", () => {
  it("persists the notification and pushes it over the socket", async () => {
    const row = { id: "n1", userId: "u2" };
    create.mockResolvedValue(row);
    await createNotification({
      userId: "u2",
      type: "SHARED",
      message: "hi",
      resource: { type: "DOCUMENT", id: "d1" },
      actorId: "u1",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u2",
          type: "SHARED",
          resourceType: "DOCUMENT",
          resourceId: "d1",
          actorId: "u1",
        }),
      })
    );
    expect(emit).toHaveBeenCalledWith("u2", "notification:new", row);
  });

  it("skips notifying a user about their own action", async () => {
    await createNotification({ userId: "u1", type: "COMMENT_ON_OWNED", message: "self", actorId: "u1" });
    expect(create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("swallows database errors so the triggering request never fails", async () => {
    create.mockRejectedValue(new Error("db down"));
    await expect(
      createNotification({ userId: "u2", type: "MENTIONED", message: "x", actorId: "u1" })
    ).resolves.toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("listNotifications", () => {
  it("returns rows plus the unread count", async () => {
    findMany.mockResolvedValue([{ id: "n1" }]);
    count.mockResolvedValue(3);
    const result = await listNotifications("u1");
    expect(result).toEqual({ notifications: [{ id: "n1" }], unreadCount: 3 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" }, orderBy: { createdAt: "desc" }, take: 50 })
    );
  });

  it("filters to unread when requested", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    await listNotifications("u1", { unreadOnly: true });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", readAt: null } })
    );
  });
});

describe("markRead", () => {
  it("scopes the update to the caller so foreign notifications are untouched", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await markRead("u1", "n1");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n1", userId: "u1", readAt: null } })
    );
  });
});

describe("markAllRead", () => {
  it("marks every unread notification for the caller", async () => {
    updateMany.mockResolvedValue({ count: 5 });
    await markAllRead("u1");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", readAt: null } })
    );
  });
});
