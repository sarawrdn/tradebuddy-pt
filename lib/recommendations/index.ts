import { prisma } from "@/lib/prisma";

const rank = (rec: string) => (rec === "BUY" ? 0 : rec === "WATCH" ? 1 : rec === "HOLD" ? 2 : 3);

/**
 * Latest recommendation per (stock, trading style) — older ones stay in the
 * database (nothing is deleted) but are hidden from this view since a
 * fresher call supersedes them.
 */
export async function getLatestRecommendations() {
  const rows = await prisma.aIRecommendation.findMany({
    include: { stock: true },
    orderBy: { date: "desc" },
    take: 500,
  });

  const seen = new Set<string>();
  const latestPerStockAndStyle = rows.filter((r) => {
    const key = `${r.stockId}:${r.tradingStyle}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const toCardShape = (r: (typeof rows)[number]) => ({
    symbol: r.stock.symbol,
    company: r.stock.company,
    dateGenerated: r.date.toISOString(),
    tradingStyle: r.tradingStyle,
    recommendation: {
      id: r.id,
      recommendation: r.recommendation,
      confidence: Number(r.confidence),
      entryPrice: r.entryPrice ? Number(r.entryPrice) : undefined,
      stopLoss: r.stopLoss ? Number(r.stopLoss) : undefined,
      takeProfit: r.takeProfit ? Number(r.takeProfit) : undefined,
      priceLevelReasoning: (r.priceLevelReasoning as string[] | null) ?? undefined,
      holdingPeriod: r.holdingPeriod ?? undefined,
      investmentThesis: r.investmentThesis,
      riskLevel: r.riskLevel,
      supportingReasons: (r.supportingReasons as string[]) ?? [],
      technicalSignal: (r.technicalSignal as "BUY" | "WATCH" | "SELL" | null) ?? undefined,
      technicalReasoning: (r.technicalReasoning as string[] | null) ?? undefined,
      technicalHoldingPeriod: r.technicalHoldingPeriod ?? undefined,
    },
  });

  const intraday = latestPerStockAndStyle
    .filter((r) => r.tradingStyle === "INTRADAY")
    .map(toCardShape)
    .sort((a, b) => rank(a.recommendation.recommendation) - rank(b.recommendation.recommendation));

  const swing = latestPerStockAndStyle
    .filter((r) => r.tradingStyle === "SWING")
    .map(toCardShape)
    .sort((a, b) => rank(a.recommendation.recommendation) - rank(b.recommendation.recommendation));

  return { intraday, swing };
}

/**
 * A stock counts as "recently upgraded" when its two most recent
 * recommendations are BUY then (immediately before) WATCH — i.e. the AI
 * changed its mind since the last check.
 */
export async function getRecentUpgrades() {
  const stocks = await prisma.shariahStock.findMany();

  const upgrades = (
    await Promise.all(
      stocks.map(async (stock) => {
        const lastTwo = await prisma.aIRecommendation.findMany({
          where: { stockId: stock.id },
          orderBy: { date: "desc" },
          take: 2,
        });

        if (lastTwo.length < 2) return null;
        const [latest, previous] = lastTwo;
        if (latest.recommendation !== "BUY" || previous.recommendation !== "WATCH") return null;

        return {
          symbol: stock.symbol,
          company: stock.company,
          recommendationId: latest.id,
          upgradedAt: latest.date.toISOString(),
        };
      })
    )
  ).filter((u): u is NonNullable<typeof u> => u !== null);

  return upgrades;
}
