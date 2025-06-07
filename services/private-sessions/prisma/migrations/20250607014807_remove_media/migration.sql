/*
  Warnings:

  - The primary key for the `media_posts` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `mediaId` on the `media_posts` table. All the data in the column will be lost.
  - You are about to drop the `media` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[authorDid,reasonSubject,reason]` on the table `notifications` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `mediaKey` to the `media_posts` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "media_posts" DROP CONSTRAINT "media_posts_mediaId_fkey";

-- AlterTable
ALTER TABLE "media_posts" DROP CONSTRAINT "media_posts_pkey",
DROP COLUMN "mediaId",
ADD COLUMN     "mediaKey" TEXT NOT NULL,
ADD CONSTRAINT "media_posts_pkey" PRIMARY KEY ("mediaKey", "encryptedPostUri");

-- DropTable
DROP TABLE "media";
