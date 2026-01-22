-- DropIndex (cleanup any old constraint variations)
DROP INDEX IF EXISTS "idx_notifications_author_subject_reason_unique";
DROP INDEX IF EXISTS "idx_notifications_user_author_subject_reason_unique";

-- CreateUniqueIndex
-- Prevents duplicate notifications for the same user from the same author for the same reason/subject
CREATE UNIQUE INDEX "idx_notifications_user_author_subject_reason_unique" ON "notifications"("userDid", "authorDid", "reasonSubject", "reason");
