-- CreateTable
CREATE TABLE "user_keys" (
	"id" TEXT NOT NULL,
	"userId" TEXT NOT NULL,
	"publicKey" TEXT NOT NULL,
	"privateKey" TEXT NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL,
	CONSTRAINT "user_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_keys_userId_idx" ON "user_keys"("userId");