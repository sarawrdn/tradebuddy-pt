import { prisma } from "@/lib/prisma";
import { getQuote } from "@/lib/market";

// Intraday positions are meant to close same-day. Without a reliable
// always-on monitor (checks only run while a browser tab is open, or once
// daily via cron), an OPEN intraday position can otherwise sit unwatched
// for many hours and blow well past its stop loss before anything notices.
// Force-closing at this age caps that exposure instead of letting it ride
// indefinitely.
const MAX_INTRADAY_HOLD_HOURS = 8;

/**
 * Advances every open paper trade against the latest live quote:
 * PENDING fills once price drops to/through the entry (limit-buy semantics),
 * OPEN closes once price reaches take profit, stop loss, or (for intraday
 * trades) has been open too long to still count as same-day.
 */
export async function checkAndFillOrders() {
  const orders = await prisma.paperTrade.findMany({
    where: { status: { in: ["PENDING", "OPEN"] } },
    include: { stock: true, recommendation: true },
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
        const quantity = Number(order.quantity);

        const style = order.recommendation?.tradingStyle ?? "INTRADAY";
        const hoursOpen = order.filledEntryAt
          ? (Date.now() - order.filledEntryAt.getTime()) / 3_600_000
          : 0;

        if (style === "INTRADAY" && hoursOpen >= MAX_INTRADAY_HOLD_HOURS) {
          const status = price >= entryPrice ? "CLOSED_WIN" : "CLOSED_LOSS";
          await closeOrder(order.id, price, entryPrice, quantity, "TIME_LIMIT", status);
        } else if (takeProfit !== null && price >= takeProfit) {
          await closeOrder(order.id, price, entryPrice, quantity, "TAKE_PROFIT", "CLOSED_WIN");
        } else if (stopLoss !== null && price <= stopLoss) {
          await closeOrder(order.id, price, entryPrice, quantity, "STOP_LOSS", "CLOSED_LOSS");
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
  exitReason: "TAKE_PROFIT" | "STOP_LOSS" | "TIME_LIMIT",
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
