import { Router } from "express";
import * as notificationsController from "../controllers/notifications.controller";
import { authenticate } from "../middleware/auth";
import { validateQuery } from "../middleware/validate";
import { listNotificationsQuerySchema } from "../schemas/notification.schema";

const router = Router();

router.use(authenticate);

router.get("/", validateQuery(listNotificationsQuerySchema), notificationsController.list);
router.post("/read-all", notificationsController.readAll);
router.post("/:id/read", notificationsController.read);

export default router;
