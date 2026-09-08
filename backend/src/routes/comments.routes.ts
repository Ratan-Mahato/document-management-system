import { Router } from "express";
import * as commentsController from "../controllers/comments.controller";
import { validateBody } from "../middleware/validate";
import { createCommentSchema, resolveCommentSchema } from "../schemas/comment.schema";

const router = Router({ mergeParams: true });

router.get("/", commentsController.list);
router.post("/", validateBody(createCommentSchema), commentsController.create);
router.patch("/:commentId", validateBody(resolveCommentSchema), commentsController.resolve);
router.delete("/:commentId", commentsController.remove);

export default router;
