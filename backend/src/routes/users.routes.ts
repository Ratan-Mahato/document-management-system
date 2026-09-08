import { Router } from "express";
import * as usersController from "../controllers/users.controller";
import { authenticate } from "../middleware/auth";
import { validateQuery } from "../middleware/validate";
import { lookupUserQuerySchema } from "../schemas/user.schema";

const router = Router();

router.use(authenticate);
router.get("/lookup", validateQuery(lookupUserQuerySchema), usersController.lookupByEmail);

export default router;
