import { getPaperTrades, getPaperTradeStats } from "@/lib/paper-trading";
import { PaperTradesClient } from "@/components/dashboard/paper-trades-client";

export const dynamic = "force-dynamic";

export default async function PaperTradesPage() {
  const [rawOrders, stats] = await Promise.all([getPaperTrades(), getPaperTradeStats()]);

  // Prisma Decimal/Date instances aren't plain serializable objects across
  // the Server -> Client component boundary — convert to the same
  // string-based shape the JSON API routes already produce.
  const orders = rawOrders.map((o) => ({
    id: o.id,
    status: o.status,
    quantity: o.quantity.toString(),
    entryPrice: o.entryPrice.toString(),
    stopLoss: o.stopLoss?.toString() ?? null,
    takeProfit: o.takeProfit?.toString() ?? null,
    filledEntryPrice: o.filledEntryPrice?.toString() ?? null,
    filledExitPrice: o.filledExitPrice?.toString() ?? null,
    exitReason: o.exitReason,
    realizedProfit: o.realizedProfit?.toString() ?? null,
    stock: { symbol: o.stock.symbol },
  }));

  return <PaperTradesClient initialOrders={orders} initialStats={stats} />;
}
