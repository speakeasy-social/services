CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "totalUses" INTEGER NOT NULL DEFAULT 1,
    "remainingUses" INTEGER NOT NULL DEFAULT 1,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT 'true',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_code_uses" (
    "id" UUID NOT NULL,
    "inviteCodeId" UUID NOT NULL,
    "userFeatureId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_code_uses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_features" (
    "id" UUID NOT NULL,
    "userDid" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "user_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "invite_code_uses_inviteCodeId_userFeatureId_key" ON "invite_code_uses"("inviteCodeId", "userFeatureId");

-- CreateIndex
CREATE INDEX "idx_user_did_key_index" ON "user_features"("userDid", "key");

-- AddForeignKey
ALTER TABLE "invite_code_uses" ADD CONSTRAINT "invite_code_uses_inviteCodeId_fkey" FOREIGN KEY ("inviteCodeId") REFERENCES "invite_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_code_uses" ADD CONSTRAINT "invite_code_uses_userFeatureId_fkey" FOREIGN KEY ("userFeatureId") REFERENCES "user_features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
