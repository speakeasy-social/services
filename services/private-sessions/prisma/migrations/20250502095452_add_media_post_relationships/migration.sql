
-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL DEFAULT public.uuid_generate_v4(),
    "userDid" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_posts" (
    "mediaId" UUID NOT NULL,
    "encryptedPostUri" TEXT NOT NULL,

    CONSTRAINT "media_posts_pkey" PRIMARY KEY ("mediaId","encryptedPostUri")
);

-- AddForeignKey
ALTER TABLE "media_posts" ADD CONSTRAINT "media_posts_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_reactions_user_did_uri_unique" RENAME TO "reactions_userDid_uri_key";
