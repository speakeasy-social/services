-- CreateTable
CREATE TABLE "user_keys" (
	"id" TEXT NOT NULL,
	"authorDid" TEXT NOT NULL,
	"publicKey" BYTEA NOT NULL,
	"privateKey" BYTEA NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"deletedAt" TIMESTAMP(3),
	CONSTRAINT "user_keys_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "user_keys_author_did_key" ON "user_keys"("authorDid") WHERE "deletedAt" IS NULL;