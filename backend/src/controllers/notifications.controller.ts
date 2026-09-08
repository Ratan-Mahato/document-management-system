import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  listNotifications,
  markAllRead,
  markRead,
} from "../services/notification.service";
import type { ListNotificationsQuery } from "../schemas/notification.schema";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { unreadOnly, take } = req.query as ListNotificationsQuery;
  const { notifications, unreadCount } = await listNotifications(req.user!.id, { unreadOnly, take });
  res.status(200).json({ notifications, unreadCount });
});

export const read = asyncHandler(async (req: Request, res: Response) => {
  await markRead(req.user!.id, req.params.id);
  res.status(204).send();
});

export const readAll = asyncHandler(async (req: Request, res: Response) => {
  await markAllRead(req.user!.id);
  res.status(204).send();
});
