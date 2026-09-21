-- كود الدخول السري + صلاحيات الصفحات لكل عامل (null = الكل)
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pin_hash" TEXT,
ADD COLUMN     "pages" JSONB;
