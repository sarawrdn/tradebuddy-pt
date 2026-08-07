-- AlterTable
ALTER TABLE "AIRecommendation" ADD COLUMN     "technicalHoldingPeriod" TEXT;

-- AlterTable
ALTER TABLE "PriceHistory" ALTER COLUMN "updatedAt" DROP DEFAULT;
