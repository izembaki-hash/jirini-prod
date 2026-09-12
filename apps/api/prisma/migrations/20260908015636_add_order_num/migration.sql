/*
  Warnings:

  - Added the required column `num` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "num" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "Order_tenant_id_num_idx" ON "Order"("tenant_id", "num");
