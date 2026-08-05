-- CreateEnum
CREATE TYPE "ShariahStatus" AS ENUM ('COMPLIANT', 'NON_COMPLIANT', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "ExitReason" AS ENUM ('TAKE_PROFIT', 'STOP_LOSS', 'AI_SELL_SIGNAL', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('BUY', 'HOLD', 'SELL', 'WATCH');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "UserDecision" AS ENUM ('FOLLOWED', 'IGNORED', 'PARTIAL', 'PENDING');

-- CreateTable
CREATE TABLE "ShariahStock" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "marketCap" DECIMAL(20,2) NOT NULL,
    "shariahStatus" "ShariahStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShariahStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "aiScore" DECIMAL(5,2),
    "technicalScore" DECIMAL(5,2),
    "fundamentalScore" DECIMAL(5,2),
    "sentimentScore" DECIMAL(5,2),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Main Portfolio',
    "cashBalance" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "averageCost" DECIMAL(20,6) NOT NULL,
    "currentPrice" DECIMAL(20,6),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "cashBalance" DECIMAL(20,2) NOT NULL,
    "portfolioValue" DECIMAL(20,2) NOT NULL,
    "unrealizedProfit" DECIMAL(20,2) NOT NULL,
    "realizedProfit" DECIMAL(20,2) NOT NULL,
    "dailyProfit" DECIMAL(20,2) NOT NULL,
    "dailyReturnPct" DECIMAL(9,4) NOT NULL,
    "totalReturnPct" DECIMAL(9,4) NOT NULL,
    "openPositions" INTEGER NOT NULL,
    "largestWinner" TEXT,
    "largestLoser" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "buyDate" TIMESTAMP(3) NOT NULL,
    "sellDate" TIMESTAMP(3),
    "quantity" DECIMAL(20,6) NOT NULL,
    "buyPrice" DECIMAL(20,6) NOT NULL,
    "sellPrice" DECIMAL(20,6),
    "fees" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "realizedProfit" DECIMAL(20,2),
    "holdingDays" INTEGER,
    "aiConfidence" DECIMAL(5,2),
    "aiRecommendation" "Recommendation",
    "investmentThesis" TEXT,
    "exitReason" "ExitReason",
    "personalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRecommendation" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recommendation" "Recommendation" NOT NULL,
    "confidence" DECIMAL(5,2) NOT NULL,
    "entryPrice" DECIMAL(20,6),
    "stopLoss" DECIMAL(20,6),
    "takeProfit" DECIMAL(20,6),
    "holdingPeriod" TEXT,
    "investmentThesis" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "supportingReasons" JSONB NOT NULL,
    "technicalScore" DECIMAL(5,2),
    "fundamentalScore" DECIMAL(5,2),
    "sentimentScore" DECIMAL(5,2),
    "userDecision" "UserDecision" NOT NULL DEFAULT 'PENDING',
    "resultAfter1Day" DECIMAL(9,4),
    "resultAfter7Days" DECIMAL(9,4),
    "resultAfter30Days" DECIMAL(9,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMarketReport" (
    "id" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "marketSummary" TEXT NOT NULL,
    "bullishPoints" JSONB NOT NULL,
    "bearishPoints" JSONB NOT NULL,
    "indices" JSONB,
    "sectorPerformance" JSONB,
    "economicCalendar" JSONB,
    "earningsCalendar" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyMarketReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShariahStock_symbol_key" ON "ShariahStock"("symbol");

-- CreateIndex
CREATE INDEX "ShariahStock_shariahStatus_idx" ON "ShariahStock"("shariahStatus");

-- CreateIndex
CREATE INDEX "ShariahStock_sector_idx" ON "ShariahStock"("sector");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_stockId_key" ON "WatchlistItem"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_portfolioId_stockId_key" ON "Holding"("portfolioId", "stockId");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_snapshotDate_idx" ON "PortfolioSnapshot"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSnapshot_portfolioId_snapshotDate_key" ON "PortfolioSnapshot"("portfolioId", "snapshotDate");

-- CreateIndex
CREATE INDEX "Trade_stockId_idx" ON "Trade"("stockId");

-- CreateIndex
CREATE INDEX "Trade_portfolioId_idx" ON "Trade"("portfolioId");

-- CreateIndex
CREATE INDEX "AIRecommendation_stockId_idx" ON "AIRecommendation"("stockId");

-- CreateIndex
CREATE INDEX "AIRecommendation_date_idx" ON "AIRecommendation"("date");

-- CreateIndex
CREATE INDEX "AIRecommendation_recommendation_idx" ON "AIRecommendation"("recommendation");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMarketReport_reportDate_key" ON "DailyMarketReport"("reportDate");

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "ShariahStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "ShariahStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "ShariahStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRecommendation" ADD CONSTRAINT "AIRecommendation_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "ShariahStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
