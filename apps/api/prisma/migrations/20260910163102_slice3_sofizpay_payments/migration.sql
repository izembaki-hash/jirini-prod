-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "amount_dzd" INTEGER NOT NULL,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "sofiz_transaction_id" TEXT,
    "cib_transaction_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_tenant_id_status_idx" ON "Payment"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenant_id_ref_key" ON "Payment"("tenant_id", "ref");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
