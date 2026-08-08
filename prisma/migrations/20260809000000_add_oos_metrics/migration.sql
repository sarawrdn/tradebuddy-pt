-- AlterTable
ALTER TABLE "OptimizedTradePlan" ADD COLUMN "oosWinRate" DECIMAL(6,2);
ALTER TABLE "OptimizedTradePlan" ADD COLUMN "oosAvgReturnPct" DECIMAL(6,2);
ALTER TABLE "OptimizedTradePlan" ADD COLUMN "oosFilledCount" INTEGER;
