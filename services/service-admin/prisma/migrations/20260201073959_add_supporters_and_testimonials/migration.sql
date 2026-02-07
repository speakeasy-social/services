-- CreateTable
CREATE TABLE "service_admin"."contributions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "did" TEXT NOT NULL,
    "contribution" TEXT NOT NULL,
    "public_data" JSONB,
    "internal_data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_admin"."testimonials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "did" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_contribution_did_created" ON "service_admin"."contributions"("did", "createdAt");

-- CreateIndex
CREATE INDEX "idx_testimonial_did" ON "service_admin"."testimonials"("did");
