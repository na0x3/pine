ALTER TABLE "Customer" ADD COLUMN "expectedMonthlyVolumeCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "Transaction" ADD COLUMN "sourceReference" TEXT;
CREATE UNIQUE INDEX "Transaction_organizationId_sourceReference_key" ON "Transaction"("organizationId", "sourceReference");

CREATE TABLE "IngestionKey" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "IngestionKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IngestionKey_tokenHash_key" ON "IngestionKey"("tokenHash");
CREATE INDEX "IngestionKey_organizationId_revokedAt_idx" ON "IngestionKey"("organizationId", "revokedAt");
ALTER TABLE "IngestionKey" ADD CONSTRAINT "IngestionKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IngestionKey" ADD CONSTRAINT "IngestionKey_createdById_organizationId_fkey" FOREIGN KEY ("createdById", "organizationId") REFERENCES "User"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
