import { prisma } from "@/lib/prisma";
import { runDecisionAgent } from "@/lib/ai/decision";

/**
 * Finds stocks whose most recent recommendation was WATCH — i.e. the AI
 * said "not yet, wait for confirmation" and nothing newer has been
 * generated since. Re-running these lets a WATCH flip to BUY get caught
 * without the user re-checking manually.
 */
async function getStocksNeedingRescan() {
  const stocks = await prisma.shariahStock.findMany();

  const latestPerStock = await Promise.all(
    stocks.map((stock) =>
      prisma.aIRecommendation.findFirst({
        where: { stockId: stock.id },
        orderBy: { date: "desc" },
      })
    )
  );

  return stocks.filter((_, i) => latestPerStock[i]?.recommendation === "WATCH");
}

interface RescanResult {
  symbol: string;
  previousStatus: "WATCH";
  newRecommendation: string;
  recommendationId: string;
}

export async function rescanWatchStocks() {
  const stocks = await getStocksNeedingRescan();

  const results = await Promise.allSettled(
    stocks.map(async (stock): Promise<RescanResult> => {
      const decision = await runDecisionAgent(stock.symbol);

      const saved = await prisma.aIRecommendation.create({
        data: {
          stockId: stock.id,
          recommendation: decision.recommendation,
          confidence: decision.confidence,
          entryPrice: decision.entryPrice,
          stopLoss: decision.stopLoss,
          takeProfit: decision.takeProfit,
          holdingPeriod: decision.holdingPeriod,
          investmentThesis: decision.investmentThesis,
          riskLevel: decision.riskLevel,
          supportingReasons: decision.supportingReasons,
        },
      });

      return {
        symbol: stock.symbol,
        previousStatus: "WATCH" as const,
        newRecommendation: decision.recommendation,
        recommendationId: saved.id,
      };
    })
  );

  const rescanned = results
    .filter((r): r is PromiseFulfilledResult<RescanResult> => r.status === "fulfilled")
    .map((r) => r.value);

  const upgradedToBuy = rescanned.filter((r) => r.newRecommendation === "BUY");

  return { rescannedCount: rescanned.length, upgradedToBuy };
}
