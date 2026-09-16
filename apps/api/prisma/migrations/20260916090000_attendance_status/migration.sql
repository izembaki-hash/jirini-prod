-- نموذج الحضور اليومي: دوام كامل/جزئي/غياب بدل دخول/خروج
-- AlterTable
ALTER TABLE "Attendance" DROP COLUMN "in_at",
DROP COLUMN "out_at",
DROP COLUMN "overtime_min",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'full';

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_tenantId_employeeId_date_key" ON "Attendance"("tenant_id", "employee_id", "date");
