import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const rows = await prisma.aIRecommendation.findMany({
    include: { stock: true },
    orderBy: { date: "desc" },
    take: 50,
  });

  const recommendations = rows.map((r) => ({
    symbol: r.stock.symbol,
    company: r.stock.company,
    dateGenerated: r.date.toISOString(),
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
  }));

  const rank = (rec: string) => (rec === "BUY" ? 0 : rec === "WATCH" ? 1 : rec === "HOLD" ? 2 : 3);
  recommendations.sort((a, b) => rank(a.recommendation.recommendation) - rank(b.recommendation.recommendation));

  return NextResponse.json({ recommendations });
}
