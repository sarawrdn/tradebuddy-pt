-- CreateEnum
CREATE TYPE "TradingStyle" AS ENUM ('INTRADAY', 'SWING');

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "tradingStyle" "TradingStyle" NOT NULL DEFAULT 'INTRADAY',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
