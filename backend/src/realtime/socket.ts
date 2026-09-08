import { Server as IOServer, Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { verifyAccessToken } from "../lib/jwt";
import { env } from "../config/env";
import { requireDocumentRole } from "../services/permission.service";
import { prisma } from "../lib/prisma";

let io: IOServer | null = null;

interface PresenceUser {
  userId: string;
  name: string;
  email: string;
}

// documentId -> socketId -> presence info. A user can hold multiple sockets
// (multiple tabs); presence is de-duplicated by userId when broadcast.
const presenceByDocument = new Map<string, Map<string, PresenceUser>>();

function roomName(documentId: string): string {
  return `document:${documentId}`;
}

function userRoomName(userId: string): string {
  return `user:${userId}`;
}

function getPresenceList(documentId: string) {
  const room = presenceByDocument.get(documentId);
  if (!room) return [];
  const byUser = new Map<string, PresenceUser>();
  for (const user of room.values()) {
    byUser.set(user.userId, user);
  }
  return [...byUser.values()];
}

function leaveDocument(socket: Socket, documentId: string) {
  socket.leave(roomName(documentId));
  const room = presenceByDocument.get(documentId);
  room?.delete(socket.id);
  if (room && room.size === 0) {
    presenceByDocument.delete(documentId);
  }
  io?.to(roomName(documentId)).emit("presence:update", getPresenceList(documentId));
}

export function initSocket(httpServer: HttpServer): IOServer {
  const allowedOrigins = env.CORS_ORIGINS.split(",").map((origin) => origin.trim());

  io = new IOServer(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error("Missing access token"));
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.email = payload.email;
      next();
    } catch {
      next(new Error("Invalid or expired access token"));
    }
  });

  io.on("connection", (socket) => {
    // Personal room for user-addressed events (notifications). The handshake
    // already authenticated the socket and set socket.data.userId.
    if (socket.data.userId) {
      socket.join(userRoomName(socket.data.userId));
    }

    socket.on("document:join", async (documentId: string, ack?: (ok: boolean, error?: string) => void) => {
      try {
        const document = await prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
        if (!document) throw new Error("Document not found");
        await requireDocumentRole(socket.data.userId, document, "VIEWER");

        const user = await prisma.user.findUnique({
          where: { id: socket.data.userId },
          select: { id: true, name: true, email: true },
        });
        if (!user) throw new Error("User not found");

        socket.join(roomName(documentId));
        socket.data.currentDocumentId = documentId;

        if (!presenceByDocument.has(documentId)) {
          presenceByDocument.set(documentId, new Map());
        }
        presenceByDocument
          .get(documentId)!
          .set(socket.id, { userId: user.id, name: user.name, email: user.email });

        io!.to(roomName(documentId)).emit("presence:update", getPresenceList(documentId));
        ack?.(true);
      } catch (err) {
        ack?.(false, err instanceof Error ? err.message : "Failed to join document");
      }
    });

    socket.on("document:leave", (documentId: string) => {
      leaveDocument(socket, documentId);
    });

    socket.on("disconnect", () => {
      const documentId = socket.data.currentDocumentId as string | undefined;
      if (documentId) {
        leaveDocument(socket, documentId);
      }
    });
  });

  return io;
}

export function broadcastToDocument(documentId: string, event: string, payload: unknown): void {
  io?.to(roomName(documentId)).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoomName(userId)).emit(event, payload);
}
