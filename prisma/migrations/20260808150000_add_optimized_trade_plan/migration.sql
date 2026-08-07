-- CreateEnum
CREATE TYPE "VolatilityBucket" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "OptimizedTradePlan" (
    "id" TEXT NOT NULL,
    "volatilityBucket" "VolatilityBucket" NOT NULL,
    "tradingStyle" "TradingStyle" NOT NULL DEFAULT 'SWING',
    "stopPct" DECIMAL(6,4) NOT NULL,
    "targetPct" DECIMAL(6,4) NOT NULL,
    "winRate" DECIMAL(6,2),
    "avgReturnPct" DECIMAL(6,2),
    "avgHoldingDays" DECIMAL(6,2),
    "signalCount" INTEGER NOT NULL,
    "filledCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptimizedTradePlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OptimizedTradePlan_volatilityBucket_tradingStyle_key" ON "OptimizedTradePlan"("volatilityBucket", "tradingStyle");
