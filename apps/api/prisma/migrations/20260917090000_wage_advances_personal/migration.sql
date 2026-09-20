-- الأجر على أساس الدوام الجزئي + سلف الموظفين + اقتناء شخصي للمشتريات
-- الموظف: مسمى وظيفي حر + أجر الجزئي (backfill يحافظ على نفس المستوى: يوم كامل قديم = 8×ساعة = 2×(4×ساعة))
-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "title" TEXT,
ADD COLUMN     "half_wage" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "Employee" SET "half_wage" = "hourlyRate" * 4 WHERE "half_wage" = 0;

-- المشتريات: مورد اختياري (NULL = اقتناء شخصي)
-- AlterTable
ALTER TABLE "Purchase" ALTER COLUMN "supplier_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SalaryAdvance" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "SalaryAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalaryAdvance_tenant_id_employee_id_date_idx" ON "SalaryAdvance"("tenant_id", "employee_id", "date");

-- AddForeignKey
ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
