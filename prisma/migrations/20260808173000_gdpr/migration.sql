-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "uninstalledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

