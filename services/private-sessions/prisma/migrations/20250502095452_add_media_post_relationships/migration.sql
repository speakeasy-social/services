
-- CreateTable
CREATE TABLE "Media" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userDid" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_posts" (
    "mediaId" UUID NOT NULL,
    "encryptedPostId" UUID NOT NULL,

    CONSTRAINT "media_posts_pkey" PRIMARY KEY ("mediaId","encryptedPostId")
);

-- AddForeignKey
ALTER TABLE "media_posts" ADD CONSTRAINT "media_posts_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_posts" ADD CONSTRAINT "media_posts_encryptedPostId_fkey" FOREIGN KEY ("encryptedPostId") REFERENCES "encrypted_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_reactions_user_did_uri_unique" RENAME TO "reactions_userDid_uri_key";
