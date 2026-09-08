import { z } from "zod";

export const lookupUserQuerySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});
