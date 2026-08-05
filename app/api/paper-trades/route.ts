import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateStock } from "@/lib/shariah";
import { checkAndFillOrders } from "@/lib/paper-trading";

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
