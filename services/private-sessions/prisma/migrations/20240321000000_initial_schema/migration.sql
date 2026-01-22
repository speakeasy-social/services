-- CreateExtension (may already exist from create-schemas.sh)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;

-- Set search_path to include public for uuid_generate_v4()
SET search_path TO private_sessions, public;

-- CreateTable
CREATE TABLE "sessions" (
	"id" UUID NOT NULL DEFAULT uuid_generate_v4(),
	"authorDid" TEXT NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"expiresAt" TIMESTAMP(3) NOT NULL,
	"revokedAt" TIMESTAMP(3),
	CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_keys" (
	"sessionId" UUID NOT NULL,
	"userKeyPairId" UUID NOT NULL,
	"recipientDid" TEXT NOT NULL,
	"encryptedDek" BYTEA NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "session_keys_pkey" PRIMARY KEY ("sessionId", "recipientDid")
);

-- CreateTable
CREATE TABLE "encrypted_posts" (
	"id" UUID NOT NULL DEFAULT uuid_generate_v4(),
	"uri" TEXT NOT NULL,
	"rkey" TEXT NOT NULL,
	"sessionId" UUID NOT NULL,
	"authorDid" TEXT NOT NULL,
	"langs" TEXT[] NOT NULL,
	"replyRootUri" TEXT,
	"replyUri" TEXT,
	"encryptedContent" BYTEA NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "encrypted_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_sessions_current" ON "sessions"("authorDid", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_posts_by_author_created" ON "encrypted_posts"("authorDid", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_posts_by_session_created_author" ON "encrypted_posts"("sessionId", "createdAt" DESC, "authorDid");

-- CreateIndex
CREATE INDEX "idx_posts_by_uri" ON "encrypted_posts"("uri");

-- CreateIndex
CREATE INDEX "idx_posts_by_reply_root" ON "encrypted_posts"("replyRootUri", "sessionId");

-- CreateIndex
CREATE INDEX "idx_posts_by_reply_parent" ON "encrypted_posts"("replyUri", "sessionId");

-- CreateIndex
CREATE INDEX "idx_session_keys_by_recipient_session_created_at" ON "session_keys"("recipientDid", "sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_session_keys_with_session_created_at" ON "session_keys"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_session_keys_with_user_key_pair_id" ON "session_keys"("userKeyPairId");

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
