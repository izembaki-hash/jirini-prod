-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Insight_tenant_id_month_key" ON "Insight"("tenant_id", "month");
