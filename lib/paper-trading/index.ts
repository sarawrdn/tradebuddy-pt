import { prisma } from "@/lib/prisma";
import { getQuote } from "@/lib/market";
import { adjustCash, getSettings } from "@/lib/settings";
import { getOrCreateStock } from "@/lib/shariah";

// 70% never occurs in practice: the Decision Agent only has today's live
// quote to reason from (no historical/fundamental data), so it correctly
// stays in a 45-65% confidence band. 60% matches the top of that realistic
// range instead of an unreachable bar. Shared between manual approval and
// automated approval so both enforce the exact same bar.
export const MIN_APPROVE_CONFIDENCE = 60;

export interface CreatePaperTradeInput {
  symbol: string;
  recommendationId?: string | null;
  quantity: number;
  entryPrice: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
}

export type CreatePaperTradeResult =
  | { ok: true; paperTrade: Awaited<ReturnType<typeof prisma.paperTrade.create>> }
  | { ok: false; error: string };

/**
 * Single source of truth for placing a paper trade — same validation
 * (BUY-only, confidence threshold, cash reserve) whether it's triggered by
 * a manual Approve click or an automated scan. See app/api/paper-trades
 * (manual) and lib/ai/auto-trade (automated) for the two callers.
 */
export async function createPaperTrade(input: CreatePaperTradeInput): Promise<CreatePaperTradeResult> {
  const { symbol, recommendationId, quantity, entryPrice } = input;

  if (!symbol || !Number.isFinite(entryPrice) || !Number.isFinite(quantity)) {
    return { ok: false, error: "symbol, entryPrice, and quantity are required" };
  }

  if (recommendationId) {
    const recommendation = await prisma.aIRecommendation.findUnique({ where: { id: recommendationId } });
    if (recommendation && recommendation.recommendation !== "BUY") {
      return { ok: false, error: `Only BUY recommendations can be approved (this one was ${recommendation.recommendation})` };
    }
    if (recommendation && Number(recommendation.confidence) < MIN_APPROVE_CONFIDENCE) {
      return {
        ok: false,
        error: `Confidence (${recommendation.confidence}%) is below the ${MIN_APPROVE_CONFIDENCE}% threshold to approve`,
      };
    }
  }

  const settings = await getSettings();
  const pendingOrders = await prisma.paperTrade.findMany({ where: { status: "PENDING" } });
  const reserved = pendingOrders.reduce((sum, o) => sum + Number(o.entryPrice) * Number(o.quantity), 0);
  const availableCash = Number(settings.cashBalance) - reserved;
  const totalCost = entryPrice * quantity;

  if (totalCost > availableCash) {
    return {
      ok: false,
      error: `Insufficient cash: this order needs $${totalCost.toFixed(2)} but only $${availableCash.toFixed(2)} is available (cash reserve minus other pending orders)`,
    };
  }

  const stock = await getOrCreateStock(symbol.trim().toUpperCase());

  const paperTrade = await prisma.paperTrade.create({
    data: {
      stockId: stock.id,
      recommendationId: recommendationId || null,
      quantity,
      entryPrice,
      stopLoss: input.stopLoss ?? null,
      takeProfit: input.takeProfit ?? null,
      status: "PENDING",
    },
    include: { stock: true },
  });

  return { ok: true, paperTrade };
}

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
          await adjustCash(-(price * Number(order.quantity)));
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

export async function getPaperTrades() {
  await checkAndFillOrders();
  return prisma.paperTrade.findMany({
    include: { stock: true, recommendation: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPaperTradeStats() {
  const trades = await prisma.paperTrade.findMany({
    where: { status: { in: ["CLOSED_WIN", "CLOSED_LOSS"] } },
    include: { stock: true, recommendation: true },
  });

  const bySymbol = new Map<
    string,
    { symbol: string; tradingStyle: string; trades: number; wins: number; losses: number; totalProfit: number }
  >();

  for (const t of trades) {
    const style = t.recommendation?.tradingStyle ?? "INTRADAY";
    const key = `${t.stock.symbol}:${style}`;
    const entry =
      bySymbol.get(key) ?? { symbol: t.stock.symbol, tradingStyle: style, trades: 0, wins: 0, losses: 0, totalProfit: 0 };
    entry.trades += 1;
    if (t.status === "CLOSED_WIN") entry.wins += 1;
    else entry.losses += 1;
    entry.totalProfit += Number(t.realizedProfit ?? 0);
    bySymbol.set(key, entry);
  }

  return Array.from(bySymbol.values())
    .map((s) => ({
      ...s,
      winRate: s.trades > 0 ? (s.wins / s.trades) * 100 : 0,
      avgProfit: s.trades > 0 ? s.totalProfit / s.trades : 0,
    }))
    .sort((a, b) => b.totalProfit - a.totalProfit);
}

function isToday(date: Date) {
  return date.toDateString() === new Date().toDateString();
}

export async function getTodaysRealizedPL() {
  const trades = await prisma.paperTrade.findMany({
    where: { status: { in: ["CLOSED_WIN", "CLOSED_LOSS"] } },
  });

  const closedToday = trades.filter((t) => t.filledExitAt && isToday(t.filledExitAt));
  const profit = closedToday.reduce((sum, t) => sum + Number(t.realizedProfit ?? 0), 0);

  return { profit, closedCount: closedToday.length };
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
  await adjustCash(exitPrice * quantity);
}
