import { prisma } from "@/lib/prisma";

const MIN_LIVE_TRADES_TO_JUDGE = 5;

export interface AccuracyReport {
  symbol: string;
  liveTrades: number;
  liveWinRate: number | null;
  liveAvgReturnPct: number | null;
  predictedWinRate: number | null;
  predictedAvgReturnPct: number | null;
  predictedSource: "individual" | "none";
  enoughLiveData: boolean;
  /** Difference between live and predicted avg return, in percentage
   * points — the actual "is this drifting" number. Null until there's
   * enough live data to compare. */
  driftPct: number | null;
  verdict: "insufficient data" | "tracking well" | "diverging — investigate" | "no prediction to compare";
}

/**
 * Compares real paper-trade outcomes against what the backtest/walk-forward
 * system predicted for each stock — the actual forward accuracy check that
 * no amount of retrospective backtesting can substitute for. Only WIN/LOSS
 * closes count (CLOSED_MANUAL is excluded — those didn't resolve via
 * stop/target, so they're not a fair test of the predicted levels).
 */
export async function checkSystemAccuracy(): Promise<AccuracyReport[]> {
  const closedTrades = await prisma.paperTrade.findMany({
    where: {
      status: { in: ["CLOSED_WIN", "CLOSED_LOSS"] },
      filledEntryPrice: { not: null },
      filledExitPrice: { not: null },
    },
    include: { stock: true },
  });

  const bySymbol = new Map<string, typeof closedTrades>();
  for (const trade of closedTrades) {
    const list = bySymbol.get(trade.stock.symbol) ?? [];
    list.push(trade);
    bySymbol.set(trade.stock.symbol, list);
  }

  const individualPlans = await prisma.individualTradePlan.findMany({
    where: { tradingStyle: "SWING" },
  });

  const reports: AccuracyReport[] = [];

  for (const [symbol, trades] of bySymbol) {
    const wins = trades.filter((t) => t.status === "CLOSED_WIN").length;
    const liveWinRate = (wins / trades.length) * 100;
    const returns = trades.map((t) => {
      const entry = Number(t.filledEntryPrice);
      const exit = Number(t.filledExitPrice);
      return ((exit - entry) / entry) * 100;
    });
    const liveAvgReturnPct = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    const plan = individualPlans.find((p) => p.symbol === symbol);
    const predictedWinRate = plan?.winRate ? Number(plan.winRate) : null;
    const predictedAvgReturnPct = plan?.avgReturnPct ? Number(plan.avgReturnPct) : null;
    const predictedSource: AccuracyReport["predictedSource"] = plan ? "individual" : "none";

    const enoughLiveData = trades.length >= MIN_LIVE_TRADES_TO_JUDGE;
    const driftPct =
      enoughLiveData && predictedAvgReturnPct !== null ? liveAvgReturnPct - predictedAvgReturnPct : null;

    let verdict: AccuracyReport["verdict"];
    if (!enoughLiveData) {
      verdict = "insufficient data";
    } else if (predictedAvgReturnPct === null) {
      verdict = "no prediction to compare";
    } else if (driftPct !== null && driftPct < -Math.abs(predictedAvgReturnPct)) {
      // Live return is worse than predicted by more than the predicted
      // return's own magnitude — a real, meaningful divergence, not noise.
      verdict = "diverging — investigate";
    } else {
      verdict = "tracking well";
    }

    reports.push({
      symbol,
      liveTrades: trades.length,
      liveWinRate,
      liveAvgReturnPct,
      predictedWinRate,
      predictedAvgReturnPct,
      predictedSource,
      enoughLiveData,
      driftPct,
      verdict,
    });
  }

  return reports.sort((a, b) => b.liveTrades - a.liveTrades);
}
