import { NextRequest, NextResponse } from "next/server";
import { getPaperTrades, createPaperTrade } from "@/lib/paper-trading";

// Fetches a live quote per distinct open-order symbol, which scales with
// how many paper trades are pending/open — guard against the default 10s
// Hobby-plan function timeout.
export const maxDuration = 30;

export async function GET() {
  const rawTrades = await getPaperTrades();
  const paperTrades = rawTrades.map((t) => ({
    ...t,
    tradingStyle: t.recommendation?.tradingStyle ?? "INTRADAY",
  }));
  return NextResponse.json({ paperTrades });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { symbol, recommendationId, quantity, entryPrice, stopLoss, takeProfit } = body;

  const qty = Number(quantity ?? 10);
  const entry = Number(entryPrice);

  const result = await createPaperTrade({
    symbol,
    recommendationId,
    quantity: qty,
    entryPrice: entry,
    stopLoss: stopLoss ? Number(stopLoss) : null,
    takeProfit: takeProfit ? Number(takeProfit) : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ paperTrade: result.paperTrade });
}
