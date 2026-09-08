-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('USER', 'ADMIN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PROMOTE';
ALTER TYPE "AuditAction" ADD VALUE 'DEMOTE';
ALTER TYPE "AuditAction" ADD VALUE 'DEACTIVATE';
ALTER TYPE "AuditAction" ADD VALUE 'REACTIVATE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "systemRole" "SystemRole" NOT NULL DEFAULT 'USER';
