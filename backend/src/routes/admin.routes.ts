import { Router } from "express";
import * as adminController from "../controllers/admin.controller";
import { authenticate, requireAdmin } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  listAuditQuerySchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  setActivationSchema,
  setRoleSchema,
} from "../schemas/admin.schema";

const router = Router();

router.use(authenticate, requireAdmin);

router.get("/users", validateQuery(listUsersQuerySchema), adminController.getUsers);
router.patch("/users/:id/role", validateBody(setRoleSchema), adminController.updateUserRole);
router.patch(
  "/users/:id/activation",
  validateBody(setActivationSchema),
  adminController.updateUserActivation
);
router.patch(
  "/users/:id/password",
  validateBody(resetPasswordSchema),
  adminController.resetUserPasswordController
);

router.get("/audit-log", validateQuery(listAuditQuerySchema), adminController.getAuditLog);

export default router;
