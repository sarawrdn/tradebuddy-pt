-- CreateEnum
CREATE TYPE "PaperTradeStatus" AS ENUM ('PENDING', 'OPEN', 'CLOSED_WIN', 'CLOSED_LOSS', 'CLOSED_MANUAL', 'CANCELLED');

-- CreateTable
CREATE TABLE "PaperTrade" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "quantity" DECIMAL(20,6) NOT NULL,
    "entryPrice" DECIMAL(20,6) NOT NULL,
    "stopLoss" DECIMAL(20,6),
    "takeProfit" DECIMAL(20,6),
    "status" "PaperTradeStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filledEntryAt" TIMESTAMP(3),
    "filledEntryPrice" DECIMAL(20,6),
    "filledExitAt" TIMESTAMP(3),
    "filledExitPrice" DECIMAL(20,6),
    "exitReason" TEXT,
    "realizedProfit" DECIMAL(20,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaperTrade_status_idx" ON "PaperTrade"("status");

-- CreateIndex
CREATE INDEX "PaperTrade_stockId_idx" ON "PaperTrade"("stockId");

-- AddForeignKey
ALTER TABLE "PaperTrade" ADD CONSTRAINT "PaperTrade_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "ShariahStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperTrade" ADD CONSTRAINT "PaperTrade_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "AIRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
