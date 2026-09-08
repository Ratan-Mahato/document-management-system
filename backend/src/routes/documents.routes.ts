import { Router } from "express";
import * as documentsController from "../controllers/documents.controller";
import commentsRouter from "./comments.routes";
import { authenticate } from "../middleware/auth";
import { uploadRateLimiter } from "../middleware/rateLimit";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  addVersionSchema,
  createDocumentSchema,
  grantPermissionSchema,
  listDocumentsQuerySchema,
  presignUploadSchema,
  updateDocumentSchema,
} from "../schemas/document.schema";

const router = Router();

router.use(authenticate);

router.get("/", validateQuery(listDocumentsQuerySchema), documentsController.list);
router.get("/trash", documentsController.listTrash);
router.post(
  "/presign-upload",
  uploadRateLimiter,
  validateBody(presignUploadSchema),
  documentsController.presignUpload
);
router.post("/", uploadRateLimiter, validateBody(createDocumentSchema), documentsController.create);
router.post("/:id/restore", documentsController.restore);
router.get("/:id", documentsController.getOne);
router.patch("/:id", validateBody(updateDocumentSchema), documentsController.update);
router.delete("/:id", documentsController.remove);
router.get("/:id/download-url", documentsController.getDownloadUrl);
router.get("/:id/preview-url", documentsController.getPreviewUrl);

router.post(
  "/:id/versions/presign-upload",
  uploadRateLimiter,
  validateBody(presignUploadSchema),
  documentsController.presignVersionUpload
);
router.post(
  "/:id/versions",
  uploadRateLimiter,
  validateBody(addVersionSchema),
  documentsController.createVersion
);
router.get("/:id/versions", documentsController.listVersions);
router.get("/:id/versions/:versionId/download-url", documentsController.getVersionDownload);
router.get("/:id/versions/:versionId/text", documentsController.getVersionText);

router.get("/:id/audit-log", documentsController.getDocumentAuditLog);

router.use("/:id/comments", commentsRouter);

router.post(
  "/:id/permissions",
  validateBody(grantPermissionSchema),
  documentsController.grantDocumentPermission
);
router.get("/:id/permissions", documentsController.listDocumentPermissions);
router.delete("/:id/permissions/:permissionId", documentsController.revokeDocumentPermission);

export default router;
