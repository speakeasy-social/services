-- AlterTable
ALTER TABLE "invite_codes" ADD COLUMN "creatorDid" TEXT;

-- CreateIndex
CREATE INDEX "idx_creator_did_created_at" ON "invite_codes"("creatorDid", "createdAt");
