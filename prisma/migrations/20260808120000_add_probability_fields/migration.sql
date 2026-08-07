-- AlterTable
ALTER TABLE "AIRecommendation" ADD COLUMN "probabilityOfProfit" DECIMAL(5,2);
ALTER TABLE "AIRecommendation" ADD COLUMN "expectedReturnPct" DECIMAL(6,2);
ALTER TABLE "AIRecommendation" ADD COLUMN "expectedDrawdownPct" DECIMAL(6,2);
