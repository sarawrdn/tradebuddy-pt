-- AlterTable
ALTER TABLE "ShariahStock" ADD COLUMN "backtestAvgReturnPct" DECIMAL(10,4);
ALTER TABLE "ShariahStock" ADD COLUMN "backtestWinRate" DECIMAL(6,2);
ALTER TABLE "ShariahStock" ADD COLUMN "backtestSignals" INTEGER;
ALTER TABLE "ShariahStock" ADD COLUMN "backtestUpdatedAt" TIMESTAMP(3);
