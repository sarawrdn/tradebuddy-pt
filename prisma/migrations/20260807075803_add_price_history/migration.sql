-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DECIMAL(20,6) NOT NULL,
    "high" DECIMAL(20,6) NOT NULL,
    "low" DECIMAL(20,6) NOT NULL,
    "close" DECIMAL(20,6) NOT NULL,
    "volume" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceHistory_stockId_idx" ON "PriceHistory"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceHistory_stockId_date_key" ON "PriceHistory"("stockId", "date");

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "ShariahStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
