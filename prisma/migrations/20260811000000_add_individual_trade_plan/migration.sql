-- CreateTable
CREATE TABLE "IndividualTradePlan" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "tradingStyle" "TradingStyle" NOT NULL DEFAULT 'SWING',
    "stopPct" DECIMAL(6,4) NOT NULL,
    "targetPct" DECIMAL(6,4) NOT NULL,
    "winRate" DECIMAL(6,2),
    "avgReturnPct" DECIMAL(6,2),
    "filledCount" INTEGER NOT NULL,
    "windowsPassed" INTEGER NOT NULL,
    "totalWindows" INTEGER NOT NULL,
    "trusted" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndividualTradePlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IndividualTradePlan_symbol_tradingStyle_key" ON "IndividualTradePlan"("symbol", "tradingStyle");
