import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const trades = await prisma.paperTrade.findMany({
    where: { status: { in: ["CLOSED_WIN", "CLOSED_LOSS"] } },
    include: { stock: true },
  });

  const bySymbol = new Map<
    string,
    { symbol: string; trades: number; wins: number; losses: number; totalProfit: number }
  >();

  for (const t of trades) {
    const symbol = t.stock.symbol;
    const entry = bySymbol.get(symbol) ?? { symbol, trades: 0, wins: 0, losses: 0, totalProfit: 0 };
    entry.trades += 1;
    if (t.status === "CLOSED_WIN") entry.wins += 1;
    else entry.losses += 1;
    entry.totalProfit += Number(t.realizedProfit ?? 0);
    bySymbol.set(symbol, entry);
  }

  const stats = Array.from(bySymbol.values())
    .map((s) => ({
      ...s,
      winRate: s.trades > 0 ? (s.wins / s.trades) * 100 : 0,
      avgProfit: s.trades > 0 ? s.totalProfit / s.trades : 0,
    }))
    .sort((a, b) => b.totalProfit - a.totalProfit);

  return NextResponse.json({
    stats,
    note:
      "Small sample sizes here are not statistically meaningful. This shows what has actually happened, not a prediction of what will happen.",
  });
}
