-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "private_profiles";

-- CreateTable
CREATE TABLE "private_profiles"."profile_sessions" (
    "id" UUID NOT NULL DEFAULT public.uuid_generate_v4(),
    "authorDid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "profile_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_profiles"."profile_session_keys" (
    "sessionId" UUID NOT NULL,
    "userKeyPairId" UUID NOT NULL,
    "recipientDid" TEXT NOT NULL,
    "encryptedDek" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_session_keys_pkey" PRIMARY KEY ("sessionId","recipientDid")
);

-- CreateTable
CREATE TABLE "private_profiles"."private_profiles" (
    "id" UUID NOT NULL DEFAULT public.uuid_generate_v4(),
    "sessionId" UUID NOT NULL,
    "authorDid" TEXT NOT NULL,
    "encryptedContent" BYTEA NOT NULL,
    "avatarUri" TEXT,
    "bannerUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "private_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_profile_sessions_current" ON "private_profiles"."profile_sessions"("authorDid", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_profile_session_keys_by_recipient_session_created_at" ON "private_profiles"."profile_session_keys"("recipientDid", "sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_profile_session_keys_with_session_created_at" ON "private_profiles"."profile_session_keys"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_profile_session_keys_with_user_key_pair_id" ON "private_profiles"."profile_session_keys"("userKeyPairId");

-- CreateIndex
CREATE INDEX "idx_private_profiles_author" ON "private_profiles"."private_profiles"("authorDid");

-- CreateIndex
CREATE INDEX "idx_private_profiles_session" ON "private_profiles"."private_profiles"("sessionId");

-- AddForeignKey
ALTER TABLE "private_profiles"."profile_session_keys" ADD CONSTRAINT "profile_session_keys_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "private_profiles"."profile_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_profiles"."private_profiles" ADD CONSTRAINT "private_profiles_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "private_profiles"."profile_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
