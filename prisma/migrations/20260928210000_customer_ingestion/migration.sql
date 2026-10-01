ALTER TABLE "Customer" ADD COLUMN "sourceReference" TEXT;
ALTER TABLE "Customer" ADD COLUMN "onboardedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Customer_organizationId_sourceReference_key" ON "Customer"("organizationId", "sourceReference");
