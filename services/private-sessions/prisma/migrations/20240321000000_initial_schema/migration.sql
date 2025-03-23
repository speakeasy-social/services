-- CreateTable
CREATE TABLE "sessions" (
	"id" UUID NOT NULL,
	"authorDid" TEXT NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"expiresAt" TIMESTAMP(3),
	"revokedAt" TIMESTAMP(3),
	"previousSessionId" UUID,
	CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_keys" (
	"sessionId" UUID NOT NULL,
	"recipientDid" TEXT NOT NULL,
	"encryptedDek" BYTEA NOT NULL,
	CONSTRAINT "session_keys_pkey" PRIMARY KEY ("sessionId", "recipientDid")
);

-- CreateTable
CREATE TABLE "staff_keys" (
	"sessionId" UUID NOT NULL,
	"dek" BYTEA NOT NULL,
	CONSTRAINT "staff_keys_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "encrypted_posts" (
	"postId" UUID NOT NULL,
	"sessionId" UUID NOT NULL,
	"authorDid" TEXT NOT NULL,
	"encryptedContent" BYTEA NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "encrypted_posts_pkey" PRIMARY KEY ("postId")
);

-- CreateIndex
CREATE INDEX "idx_sessions_current" ON "sessions"("authorDid", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_posts_by_author" ON "encrypted_posts"("authorDid", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_posts_by_session" ON "encrypted_posts"("sessionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_session_keys_by_recipient" ON "session_keys"("recipientDid", "sessionId");

-- CreateIndex
CREATE INDEX "idx_posts_by_time" ON "encrypted_posts"("createdAt" DESC, "sessionId");

-- CreateIndex
CREATE INDEX "idx_session_keys_with_session" ON "session_keys"("sessionId", "recipientDid") INCLUDE ("encryptedDek");

-- AddForeignKey
ALTER TABLE
	"sessions"
ADD
	CONSTRAINT "sessions_previousSessionId_fkey" FOREIGN KEY ("previousSessionId") REFERENCES "sessions"("id") ON DELETE
SET
	NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
	"session_keys"
ADD
	CONSTRAINT "session_keys_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
	"staff_keys"
ADD
	CONSTRAINT "staff_keys_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
	"encrypted_posts"
ADD
	CONSTRAINT "encrypted_posts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;