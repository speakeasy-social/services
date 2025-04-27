-- CreateTable
CREATE TABLE "reactions" (
    "id" UUID NOT NULL,
    "userDid" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userDid" TEXT NOT NULL,
    "authorDid" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonSubject" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seen_notifications" (
    "id" UUID NOT NULL,
    "userDid" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seen_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_reactions_user_did_created" ON "reactions"("userDid", "createdAt");

-- CreateIndex
CREATE INDEX "idx_reactions_uri_created" ON "reactions"("uri", "createdAt");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "idx_reactions_user_did_uri_unique" ON "reactions"("userDid", "uri");

-- CreateIndex
CREATE INDEX "idx_notifications_user_did_created_at_index" ON "notifications"("userDid", "createdAt");

-- CreateIndex
CREATE INDEX "idx_notifications_user_did_read_at_index" ON "notifications"("userDid", "readAt");

-- CreateIndex
CREATE INDEX "idx_seen_notifications_user_did" ON "seen_notifications"("userDid");
