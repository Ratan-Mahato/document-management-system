import { Router } from "express";
import * as foldersController from "../controllers/folders.controller";
import { authenticate } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  createFolderSchema,
  listFoldersQuerySchema,
  updateFolderSchema,
} from "../schemas/folder.schema";
import { grantPermissionSchema } from "../schemas/document.schema";

const router = Router();

router.use(authenticate);

router.get("/", validateQuery(listFoldersQuerySchema), foldersController.list);
router.get("/trash", foldersController.listTrash);
router.post("/", validateBody(createFolderSchema), foldersController.create);
router.post("/:id/restore", foldersController.restore);
router.get("/:id", foldersController.getOne);
router.patch("/:id", validateBody(updateFolderSchema), foldersController.update);
router.delete("/:id", foldersController.remove);

router.post(
  "/:id/permissions",
  validateBody(grantPermissionSchema),
  foldersController.grantFolderPermission
);
router.get("/:id/permissions", foldersController.listFolderPermissions);
router.delete("/:id/permissions/:permissionId", foldersController.revokeFolderPermission);

router.get("/:id/audit-log", foldersController.getFolderAuditLog);

export default router;
