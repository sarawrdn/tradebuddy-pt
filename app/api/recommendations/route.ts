import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const rank = (rec: string) => (rec === "BUY" ? 0 : rec === "WATCH" ? 1 : rec === "HOLD" ? 2 : 3);

export async function GET() {
  // Fetch recent history and keep only the latest recommendation per
  // (stock, trading style) — older ones stay in the database (nothing is
  // deleted) but are hidden from this view since a fresher call supersedes
  // them.
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
      holdingPeriod: r.holdingPeriod ?? undefined,
      investmentThesis: r.investmentThesis,
      riskLevel: r.riskLevel,
      supportingReasons: (r.supportingReasons as string[]) ?? [],
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

  return NextResponse.json({ intraday, swing });
}
