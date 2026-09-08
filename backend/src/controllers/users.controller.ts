import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { prisma } from "../lib/prisma";

export const lookupByEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.query as { email: string };
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    throw AppError.notFound("No user found with that email");
  }
  res.status(200).json({ user });
});
