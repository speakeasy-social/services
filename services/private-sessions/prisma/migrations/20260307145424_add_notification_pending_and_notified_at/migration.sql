-- DropIndex
DROP INDEX IF EXISTS "private_sessions"."idx_notifications_user_did_created_at_index";

-- AlterTable
ALTER TABLE "private_sessions"."notifications"
ADD COLUMN "pending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "idx_notifications_user_did_notified_at_index" ON "private_sessions"."notifications"("userDid", "notifiedAt");
