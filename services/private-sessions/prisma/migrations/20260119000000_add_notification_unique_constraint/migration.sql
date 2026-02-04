-- DropIndex (cleanup any old constraint variations)
DROP INDEX IF EXISTS "idx_notifications_author_subject_reason_unique";
DROP INDEX IF EXISTS "idx_notifications_user_author_subject_reason_unique";

-- Delete duplicate notifications, keeping only the first (earliest) one
DELETE FROM notifications
WHERE id NOT IN (
  SELECT MIN(id::text)::uuid
  FROM notifications
  GROUP BY "userDid", "authorDid", "reasonSubject", "reason"
);

-- CreateUniqueIndex
-- Prevents duplicate notifications for the same user from the same author for the same reason/subject
CREATE UNIQUE INDEX "idx_notifications_user_author_subject_reason_unique" ON "notifications"("userDid", "authorDid", "reasonSubject", "reason");
