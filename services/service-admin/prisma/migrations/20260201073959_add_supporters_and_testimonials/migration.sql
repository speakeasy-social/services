-- CreateTable
CREATE TABLE "service_admin"."supporters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "did" TEXT NOT NULL,
    "contribution" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supporters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_admin"."testimonials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "did" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_supporter_did_created" ON "service_admin"."supporters"("did", "createdAt");

-- CreateIndex
CREATE INDEX "idx_testimonial_did" ON "service_admin"."testimonials"("did");
