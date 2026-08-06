import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateStock } from "@/lib/shariah";
import { checkAndFillOrders } from "@/lib/paper-trading";

// Fetches a live quote per distinct open-order symbol, which scales with
// how many paper trades are pending/open — guard against the default 10s
// Hobby-plan function timeout.
export const maxDuration = 30;

// 70% never occurs in practice: the Decision Agent only has today's live
// quote to reason from (no historical/fundamental data), so it correctly
// stays in a 45-65% confidence band. 60% matches the top of that realistic
// range instead of an unreachable bar.
const MIN_APPROVE_CONFIDENCE = 60;

export async function GET() {
  await checkAndFillOrders();

  const paperTrades = await prisma.paperTrade.findMany({
    include: { stock: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ paperTrades });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { symbol, recommendationId, quantity, entryPrice, stopLoss, takeProfit } = body;

  if (!symbol || !entryPrice) {
    return NextResponse.json({ error: "symbol and entryPrice are required" }, { status: 400 });
  }

  const qty = Number(quantity ?? 10);
  const entry = Number(entryPrice);

  if (Number.isNaN(qty) || Number.isNaN(entry)) {
    return NextResponse.json({ error: "quantity and entryPrice must be numbers" }, { status: 400 });
  }

  if (recommendationId) {
    const recommendation = await prisma.aIRecommendation.findUnique({ where: { id: recommendationId } });
    if (recommendation && Number(recommendation.confidence) < MIN_APPROVE_CONFIDENCE) {
      return NextResponse.json(
        { error: `Confidence (${recommendation.confidence}%) is below the ${MIN_APPROVE_CONFIDENCE}% threshold to approve` },
        { status: 400 }
      );
    }
  }

  const stock = await getOrCreateStock(String(symbol).trim().toUpperCase());

  const paperTrade = await prisma.paperTrade.create({
    data: {
      stockId: stock.id,
      recommendationId: recommendationId || null,
      quantity: qty,
      entryPrice: entry,
      stopLoss: stopLoss ? Number(stopLoss) : null,
      takeProfit: takeProfit ? Number(takeProfit) : null,
      status: "PENDING",
    },
    include: { stock: true },
  });

  return NextResponse.json({ paperTrade });
}
