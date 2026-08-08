import { getExtendedHistory, type Candle } from "@/lib/market-history";
import { getShariahUniverse } from "@/lib/shariah";
import { prisma } from "@/lib/prisma";
import {
  summarizeTechnicals,
  deriveTechnicalSignal,
  calculateTradeLevels,
  STYLE_BOUNDS,
} from "@/lib/indicators";
import { loadOptimizedPlans, classifyBucketSync, type LoadedOptimizedPlans } from "@/lib/optimize";
import { calculateRiskMetrics, type RiskMetrics } from "@/lib/metrics";

export type TradingStyle = "INTRADAY" | "SWING";

const MIN_LOOKBACK = 35; // MACD's minimum before a signal is meaningful
const MAX_FILL_WAIT_DAYS = 10;
const MAX_HOLD_DAYS = 60;

export interface BacktestTrade {
  signalDate: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  filled: boolean;
  filledDate?: string;
  outcome?: "WIN" | "LOSS" | "UNRESOLVED";
  resolvedDate?: string;
  returnPct?: number;
}

export interface BacktestResult {
  symbol: string;
  style: TradingStyle;
  totalSignals: number;
  filled: number;
  notFilled: number;
  wins: number;
  losses: number;
  unresolved: number;
  winRate: number | null; // wins / (wins + losses), null if none resolved
  avgReturnPct: number | null;
  metrics: RiskMetrics;
  trades: BacktestTrade[];
}

/**
 * Walk-forward backtest of the deterministic Data Signal + price levels
 * only — not the AI Signal, since DeepSeek isn't reproducible even at
 * temperature 0 and so can't be backtested meaningfully. At each day, only
 * candles up to and including that day are used (no lookahead). A BUY signal
 * opens a simulated limit order at that day's calculated entry price, which
 * must be touched (low <= entryPrice) within MAX_FILL_WAIT_DAYS to fill, then
 * resolves WIN/LOSS based on which of stop-loss/take-profit is hit first
 * within MAX_HOLD_DAYS. A day that touches both stop and target is treated as
 * a LOSS (conservative — can't know intraday ordering from daily OHLC).
 *
 * Price levels prefer the grid-search-optimized stop%/target% for that
 * day's volatility bucket (see lib/optimize) when `optimizedPlans` is
 * passed and has enough backtested trades for the bucket; otherwise falls
 * back to the fixed support/resistance/ATR rule in calculateTradeLevels —
 * same fallback logic as the live Decision Agent, so this backtest reflects
 * what the app would actually have done.
 *
 * Sequential, not daily-overlapping — see the matching comment in
 * lib/optimize/backtestPlanOnCandles. Skips past each trade's full
 * lifecycle before considering the next signal, so one continuous trend
 * can't get counted as many correlated "trades."
 */
export function runBacktest(
  symbol: string,
  candles: Candle[],
  style: TradingStyle = "SWING",
  optimizedPlans?: LoadedOptimizedPlans
): BacktestResult {
  const bounds = STYLE_BOUNDS[style];
  const trades: BacktestTrade[] = [];

  let d = MIN_LOOKBACK;
  while (d < candles.length) {
    const history = candles.slice(0, d + 1);
    const today = history[history.length - 1];

    const tech = summarizeTechnicals(history);
    const { signal } = deriveTechnicalSignal(tech);
    if (signal !== "BUY") {
      d++;
      continue;
    }

    let levels: { entryPrice: number; stopLoss: number; takeProfit: number };
    const optimizedPlan =
      optimizedPlans && tech.atrPct !== null
        ? optimizedPlans.plans[classifyBucketSync(tech.atrPct, optimizedPlans)]
        : null;
    if (optimizedPlan && optimizedPlan.filledCount >= 20) {
      levels = {
        entryPrice: Number(today.close.toFixed(2)),
        stopLoss: Number((today.close * (1 - optimizedPlan.stopPct)).toFixed(2)),
        takeProfit: Number((today.close * (1 + optimizedPlan.targetPct)).toFixed(2)),
      };
    } else {
      levels = calculateTradeLevels(today.close, tech, style, bounds);
    }

    const trade: BacktestTrade = {
      signalDate: today.date.toISOString().slice(0, 10),
      entryPrice: levels.entryPrice,
      stopLoss: levels.stopLoss,
      takeProfit: levels.takeProfit,
      filled: false,
    };

    const fillDeadline = Math.min(d + MAX_FILL_WAIT_DAYS, candles.length - 1);
    let filledIndex: number | null = null;
    for (let f = d + 1; f <= fillDeadline; f++) {
      if (candles[f].low <= levels.entryPrice) {
        filledIndex = f;
        break;
      }
    }

    if (filledIndex === null) {
      trades.push(trade);
      d = fillDeadline + 1;
      continue;
    }

    trade.filled = true;
    trade.filledDate = candles[filledIndex].date.toISOString().slice(0, 10);

    const holdDeadline = Math.min(filledIndex + MAX_HOLD_DAYS, candles.length - 1);
    let outcome: "WIN" | "LOSS" | "UNRESOLVED" = "UNRESOLVED";
    let resolvedDate: string | undefined;
    let resolvedIndex = holdDeadline;
    for (let r = filledIndex + 1; r <= holdDeadline; r++) {
      const c = candles[r];
      const hitStop = c.low <= levels.stopLoss;
      const hitTarget = c.high >= levels.takeProfit;
      if (hitStop && hitTarget) {
        outcome = "LOSS";
        resolvedDate = c.date.toISOString().slice(0, 10);
        resolvedIndex = r;
        break;
      }
      if (hitStop) {
        outcome = "LOSS";
        resolvedDate = c.date.toISOString().slice(0, 10);
        resolvedIndex = r;
        break;
      }
      if (hitTarget) {
        outcome = "WIN";
        resolvedDate = c.date.toISOString().slice(0, 10);
        resolvedIndex = r;
        break;
      }
    }

    d = resolvedIndex + 1;

    trade.outcome = outcome;
    trade.resolvedDate = resolvedDate;
    if (outcome !== "UNRESOLVED") {
      const exitPrice = outcome === "WIN" ? levels.takeProfit : levels.stopLoss;
      trade.returnPct = ((exitPrice - levels.entryPrice) / levels.entryPrice) * 100;
    }

    trades.push(trade);
  }

  const filled = trades.filter((t) => t.filled);
  const wins = filled.filter((t) => t.outcome === "WIN");
  const losses = filled.filter((t) => t.outcome === "LOSS");
  const unresolved = filled.filter((t) => t.outcome === "UNRESOLVED");
  const resolved = [...wins, ...losses];
  const resolvedForMetrics = resolved.map((t) => ({
    outcome: t.outcome as "WIN" | "LOSS",
    returnPct: t.returnPct ?? 0,
  }));

  return {
    symbol,
    style,
    totalSignals: trades.length,
    filled: filled.length,
    notFilled: trades.length - filled.length,
    wins: wins.length,
    losses: losses.length,
    unresolved: unresolved.length,
    winRate: resolved.length > 0 ? (wins.length / resolved.length) * 100 : null,
    avgReturnPct:
      resolved.length > 0
        ? resolved.reduce((sum, t) => sum + (t.returnPct ?? 0), 0) / resolved.length
        : null,
    metrics: calculateRiskMetrics(resolvedForMetrics),
    trades,
  };
}

/** Convenience wrapper: fetches extended history for a symbol, backtests it,
 * and persists the result onto ShariahStock so the live Decision Agent can
 * gate BUY signals by a stock's own backtested edge. */
export async function backtestSymbol(
  symbol: string,
  style: TradingStyle = "SWING",
  days = 250
): Promise<BacktestResult> {
  const candles = await getExtendedHistory(symbol, days);
  const optimizedPlans = await loadOptimizedPlans(style);
  const result = runBacktest(symbol, candles, style, optimizedPlans);

  await prisma.shariahStock.updateMany({
    where: { symbol },
    data: {
      backtestAvgReturnPct: result.avgReturnPct,
      backtestWinRate: result.winRate,
      backtestSignals: result.totalSignals,
      backtestUpdatedAt: new Date(),
    },
  });

  return result;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UniverseBacktestSummary {
  totalStocks: number;
  ok: number;
  failed: { symbol: string; error: string }[];
  totalSignals: number;
  totalFilled: number;
  totalWins: number;
  totalLosses: number;
  totalUnresolved: number;
  overallWinRate: number | null;
  overallAvgReturnPct: number | null;
  results: BacktestResult[];
}

/**
 * Backtests every stock in the Shariah universe and aggregates the results —
 * used to tell whether a bad result on one symbol (see backtestSymbol) is
 * that stock specifically or a systemic flaw in the Data Signal / trade
 * level rules. Runs sequentially with the same 8s spacing as
 * warmPriceHistoryCache to stay under Twelve Data's free-tier rate limit,
 * so a full run of an 18+ stock universe takes minutes — meant for local/
 * script use (see scripts/backtest-universe) rather than a single Vercel
 * request, though the API route will return whatever completes within its
 * function timeout.
 */
export async function backtestUniverse(
  style: TradingStyle = "SWING",
  days = 250
): Promise<UniverseBacktestSummary> {
  const universe = await getShariahUniverse();
  const results: BacktestResult[] = [];
  const failed: { symbol: string; error: string }[] = [];

  for (const stock of universe) {
    try {
      results.push(await backtestSymbol(stock.symbol, style, days));
    } catch (err) {
      failed.push({ symbol: stock.symbol, error: err instanceof Error ? err.message : String(err) });
    }
    await sleep(8_000);
  }

  const totalSignals = results.reduce((sum, r) => sum + r.totalSignals, 0);
  const totalFilled = results.reduce((sum, r) => sum + r.filled, 0);
  const totalWins = results.reduce((sum, r) => sum + r.wins, 0);
  const totalLosses = results.reduce((sum, r) => sum + r.losses, 0);
  const totalUnresolved = results.reduce((sum, r) => sum + r.unresolved, 0);
  const resolved = totalWins + totalLosses;

  const allReturns = results.flatMap((r) =>
    r.trades.filter((t) => t.returnPct !== undefined).map((t) => t.returnPct as number)
  );

  return {
    totalStocks: universe.length,
    ok: results.length,
    failed,
    totalSignals,
    totalFilled,
    totalWins,
    totalLosses,
    totalUnresolved,
    overallWinRate: resolved > 0 ? (totalWins / resolved) * 100 : null,
    overallAvgReturnPct:
      allReturns.length > 0 ? allReturns.reduce((sum, v) => sum + v, 0) / allReturns.length : null,
    results,
  };
}
