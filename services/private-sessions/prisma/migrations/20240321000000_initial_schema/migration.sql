-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateTable
CREATE TABLE "sessions" (
	"id" UUID NOT NULL,
	"authorDid" TEXT NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"expiresAt" TIMESTAMP(3) NOT NULL,
	"revokedAt" TIMESTAMP(3),
	CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_keys" (
	"sessionId" UUID NOT NULL,
	"userKeyPairId" TEXT NOT NULL,
	"recipientDid" TEXT NOT NULL,
	"encryptedDek" BYTEA NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "session_keys_pkey" PRIMARY KEY ("sessionId", "recipientDid")
);

-- CreateTable
CREATE TABLE "encrypted_posts" (
	"rkey" TEXT NOT NULL,
	"sessionId" UUID NOT NULL,
	"authorDid" TEXT NOT NULL,
	"langs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
	"replyRootUri" TEXT NOT NULL,
	"replyUri" TEXT NOT NULL,
	"encryptedContent" BYTEA NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "encrypted_posts_pkey" PRIMARY KEY ("rkey")
);

-- CreateTable
CREATE TABLE "user_features" (
	"id" UUID NOT NULL DEFAULT uuid_generate_v4(),
	"userDid" TEXT NOT NULL,
	"key" TEXT NOT NULL,
	"value" TEXT NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3),
	CONSTRAINT "user_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_sessions_current" ON "sessions"("authorDid", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_posts_by_author_created" ON "encrypted_posts"("authorDid", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_posts_by_session_created_author" ON "encrypted_posts"("sessionId", "createdAt" DESC, "authorDid");

-- CreateIndex
CREATE INDEX "idx_posts_by_reply_root" ON "encrypted_posts"("replyRootUri", "sessionId");

-- CreateIndex
CREATE INDEX "idx_posts_by_reply_parent" ON "encrypted_posts"("replyUri", "sessionId");

-- CreateIndex
CREATE INDEX "idx_session_keys_by_recipient" ON "session_keys"("recipientDid", "sessionId");

-- CreateIndex
CREATE INDEX "idx_session_keys_with_session" ON "session_keys"("sessionId", "recipientDid") INCLUDE ("encryptedDek");

-- AddForeignKey
ALTER TABLE
	"session_keys"
ADD
	CONSTRAINT "session_keys_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
	"encrypted_posts"
ADD
	CONSTRAINT "encrypted_posts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;