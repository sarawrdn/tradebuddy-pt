import { prisma } from "@/lib/prisma";
import { getQuote } from "@/lib/market";

/**
 * Advances every open paper trade against the latest live quote:
 * PENDING fills once price drops to/through the entry (limit-buy semantics),
 * OPEN closes once price reaches take profit or stop loss.
 */
export async function checkAndFillOrders() {
  const orders = await prisma.paperTrade.findMany({
    where: { status: { in: ["PENDING", "OPEN"] } },
    include: { stock: true },
  });

  const bySymbol = new Map<string, typeof orders>();
  for (const order of orders) {
    const list = bySymbol.get(order.stock.symbol) ?? [];
    list.push(order);
    bySymbol.set(order.stock.symbol, list);
  }

  for (const [symbol, symbolOrders] of bySymbol) {
    let price: number;
    try {
      price = (await getQuote(symbol)).price;
    } catch {
      continue;
    }

    for (const order of symbolOrders) {
      if (order.status === "PENDING") {
        const entry = Number(order.entryPrice);
        if (price <= entry) {
          await prisma.paperTrade.update({
            where: { id: order.id },
            data: {
              status: "OPEN",
              filledEntryAt: new Date(),
              filledEntryPrice: price,
            },
          });
        }
        continue;
      }

      if (order.status === "OPEN") {
        const entryPrice = Number(order.filledEntryPrice ?? order.entryPrice);
        const takeProfit = order.takeProfit ? Number(order.takeProfit) : null;
        const stopLoss = order.stopLoss ? Number(order.stopLoss) : null;

        if (takeProfit !== null && price >= takeProfit) {
          await closeOrder(order.id, price, entryPrice, Number(order.quantity), "TAKE_PROFIT", "CLOSED_WIN");
        } else if (stopLoss !== null && price <= stopLoss) {
          await closeOrder(order.id, price, entryPrice, Number(order.quantity), "STOP_LOSS", "CLOSED_LOSS");
        }
      }
    }
  }
}

async function closeOrder(
  id: string,
  exitPrice: number,
  entryPrice: number,
  quantity: number,
  exitReason: "TAKE_PROFIT" | "STOP_LOSS",
  status: "CLOSED_WIN" | "CLOSED_LOSS"
) {
  const realizedProfit = (exitPrice - entryPrice) * quantity;
  await prisma.paperTrade.update({
    where: { id },
    data: {
      status,
      filledExitAt: new Date(),
      filledExitPrice: exitPrice,
      exitReason,
      realizedProfit,
    },
  });
}
