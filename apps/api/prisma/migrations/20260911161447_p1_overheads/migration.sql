-- CreateTable
CREATE TABLE "Overhead" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "monthly" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Overhead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Overhead_tenant_id_idx" ON "Overhead"("tenant_id");

-- AddForeignKey
ALTER TABLE "Overhead" ADD CONSTRAINT "Overhead_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
