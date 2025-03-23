-- CreateTable
CREATE TABLE "trusted_users" (
	"authorDid" TEXT NOT NULL,
	"recipientDid" TEXT NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"deletedAt" TIMESTAMP(3),
	CONSTRAINT "trusted_users_pkey" PRIMARY KEY ("authorDid", "recipientDid", "createdAt")
);

-- CreateIndex
CREATE INDEX "idx_trusted_users_by_author" ON "trusted_users"("authorDid", "deletedAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_trusted_users_by_recipient" ON "trusted_users"("recipientDid", "deletedAt", "createdAt" DESC);