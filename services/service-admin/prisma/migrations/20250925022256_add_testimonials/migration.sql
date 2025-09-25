-- CreateTable
CREATE TABLE "testimonials" (
    "id" UUID NOT NULL,
    "userDid" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_testimonial_user_did" ON "testimonials"("userDid");
