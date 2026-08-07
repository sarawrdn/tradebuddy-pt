import { getExtendedHistory, type Candle } from "@/lib/market-history";
import { getShariahUniverse } from "@/lib/shariah";
import { prisma } from "@/lib/prisma";
import { summarizeTechnicals, deriveTechnicalSignal, atr } from "@/lib/indicators";

export type TradingStyle = "INTRADAY" | "SWING";
export type VolatilityBucket = "LOW" | "MEDIUM" | "HIGH";

const MIN_LOOKBACK = 35;
const MAX_FILL_WAIT_DAYS = 10;
const MAX_HOLD_DAYS = 60;

interface TradePlan {
  stopPct: number;
  targetPct: number;
}

interface PlanTradeOutcome {
  outcome: "WIN" | "LOSS" | "UNRESOLVED";
  returnPct: number;
  holdingDays: number;
}

/** Same signal-timing walk-forward as lib/backtest, but with a fixed
 * stop%/target% instead of calculateTradeLevels — used to grid-search which
 * stop/target combination actually performs best, instead of assuming the
 * support/resistance-based rule is right. */
function backtestPlanOnCandles(candles: Candle[], plan: TradePlan): PlanTradeOutcome[] {
  const outcomes: PlanTradeOutcome[] = [];

  for (let d = MIN_LOOKBACK; d < candles.length; d++) {
    const history = candles.slice(0, d + 1);
    const today = history[history.length - 1];

    const tech = summarizeTechnicals(history);
    const { signal } = deriveTechnicalSignal(tech);
    if (signal !== "BUY") continue;

    const entryPrice = today.close;
    const stopLoss = entryPrice * (1 - plan.stopPct);
    const takeProfit = entryPrice * (1 + plan.targetPct);

    let filledIndex: number | null = null;
    for (let f = d + 1; f <= Math.min(d + MAX_FILL_WAIT_DAYS, candles.length - 1); f++) {
      if (candles[f].low <= entryPrice) {
        filledIndex = f;
        break;
      }
    }
    if (filledIndex === null) continue;

    let outcome: "WIN" | "LOSS" | "UNRESOLVED" = "UNRESOLVED";
    let holdingDays = 0;
    for (let r = filledIndex + 1; r <= Math.min(filledIndex + MAX_HOLD_DAYS, candles.length - 1); r++) {
      const c = candles[r];
      const hitStop = c.low <= stopLoss;
      const hitTarget = c.high >= takeProfit;
      holdingDays = r - filledIndex;
      if (hitStop) {
        outcome = "LOSS";
        break;
      }
      if (hitTarget) {
        outcome = "WIN";
        break;
      }
    }

    if (outcome === "UNRESOLVED") continue;
    const exitPrice = outcome === "WIN" ? takeProfit : stopLoss;
    const returnPct = ((exitPrice - entryPrice) / entryPrice) * 100;
    outcomes.push({ outcome, returnPct, holdingDays });
  }

  return outcomes;
}

/** Grid of candidate stop%/target% combinations to backtest — a coarser
 * "thousands of trade plans" than a real ML search space, but this is plain
 * CPU work over already-cached candles, so a few hundred combinations run in
 * seconds with no external calls. */
function generateTradePlans(style: TradingStyle): TradePlan[] {
  const stopRange = style === "SWING" ? { min: 0.03, max: 0.1, step: 0.005 } : { min: 0.004, max: 0.015, step: 0.0005 };
  const targetRange = style === "SWING" ? { min: 0.05, max: 0.25, step: 0.01 } : { min: 0.006, max: 0.03, step: 0.001 };

  const plans: TradePlan[] = [];
  for (let stopPct = stopRange.min; stopPct <= stopRange.max + 1e-9; stopPct += stopRange.step) {
    for (let targetPct = targetRange.min; targetPct <= targetRange.max + 1e-9; targetPct += targetRange.step) {
      plans.push({ stopPct: Number(stopPct.toFixed(4)), targetPct: Number(targetPct.toFixed(4)) });
    }
  }
  return plans;
}

/** Present-day ATR% is used purely to sort stocks into relative volatility
 * terciles — not to compute the trade itself. */
function currentAtrPct(candles: Candle[]): number | null {
  const value = atr(candles, 14);
  const price = candles[candles.length - 1]?.close;
  if (value === null || !price) return null;
  return (value / price) * 100;
}

export interface BucketOptimizationResult {
  bucket: VolatilityBucket;
  symbols: string[];
  bestPlan: TradePlan;
  signalCount: number;
  filledCount: number;
  winRate: number | null;
  avgReturnPct: number | null;
  avgHoldingDays: number | null;
}

export interface OptimizationSummary {
  style: TradingStyle;
  buckets: BucketOptimizationResult[];
}

const MIN_FILLED_FOR_VALID_PLAN = 20;

/**
 * Groups the stock universe into three volatility terciles by current ATR%,
 * grid-searches stop%/target% combinations against each bucket's pooled
 * historical signals (not per-stock — too few signals per stock to avoid
 * curve-fitting), and persists the best-performing combination per bucket to
 * OptimizedTradePlan. "Best" = highest average return among plans with at
 * least MIN_FILLED_FOR_VALID_PLAN filled trades, so a plan that "won" on 2
 * lucky trades can't outrank one proven across 50.
 */
export async function optimizeTradePlans(style: TradingStyle = "SWING", days = 250): Promise<OptimizationSummary> {
  const universe = await getShariahUniverse();

  const stockData: { symbol: string; candles: Candle[]; atrPct: number }[] = [];
  for (const stock of universe) {
    const candles = await getExtendedHistory(stock.symbol, days);
    const atrPct = currentAtrPct(candles);
    if (atrPct !== null && candles.length > MIN_LOOKBACK) {
      stockData.push({ symbol: stock.symbol, candles, atrPct });
    }
  }

  stockData.sort((a, b) => a.atrPct - b.atrPct);
  const third = Math.ceil(stockData.length / 3);
  const buckets: Record<VolatilityBucket, typeof stockData> = {
    LOW: stockData.slice(0, third),
    MEDIUM: stockData.slice(third, third * 2),
    HIGH: stockData.slice(third * 2),
  };

  const plans = generateTradePlans(style);
  const results: BucketOptimizationResult[] = [];

  for (const bucket of ["LOW", "MEDIUM", "HIGH"] as VolatilityBucket[]) {
    const stocksInBucket = buckets[bucket];
    if (stocksInBucket.length === 0) continue;

    let best: { plan: TradePlan; outcomes: PlanTradeOutcome[] } | null = null;

    for (const plan of plans) {
      const outcomes = stocksInBucket.flatMap((s) => backtestPlanOnCandles(s.candles, plan));
      if (outcomes.length < MIN_FILLED_FOR_VALID_PLAN) continue;

      const avgReturn = outcomes.reduce((sum, o) => sum + o.returnPct, 0) / outcomes.length;
      const bestAvgReturn = best
        ? best.outcomes.reduce((sum, o) => sum + o.returnPct, 0) / best.outcomes.length
        : -Infinity;

      if (avgReturn > bestAvgReturn) {
        best = { plan, outcomes };
      }
    }

    if (!best) continue;

    const wins = best.outcomes.filter((o) => o.outcome === "WIN");
    const avgReturnPct = best.outcomes.reduce((sum, o) => sum + o.returnPct, 0) / best.outcomes.length;
    const avgHoldingDays = best.outcomes.reduce((sum, o) => sum + o.holdingDays, 0) / best.outcomes.length;
    const winRate = (wins.length / best.outcomes.length) * 100;

    // Total signal count includes ones that never filled, for context —
    // outcomes above only counts filled+resolved trades.
    const signalCount = stocksInBucket.reduce((sum, s) => {
      let count = 0;
      for (let d = MIN_LOOKBACK; d < s.candles.length; d++) {
        const tech = summarizeTechnicals(s.candles.slice(0, d + 1));
        if (deriveTechnicalSignal(tech).signal === "BUY") count++;
      }
      return sum + count;
    }, 0);

    const atrPctMax = Math.max(...stocksInBucket.map((s) => s.atrPct));

    results.push({
      bucket,
      symbols: stocksInBucket.map((s) => s.symbol),
      bestPlan: best.plan,
      signalCount,
      filledCount: best.outcomes.length,
      winRate,
      avgReturnPct,
      avgHoldingDays,
    });

    await prisma.optimizedTradePlan.upsert({
      where: { volatilityBucket_tradingStyle: { volatilityBucket: bucket, tradingStyle: style } },
      update: {
        stopPct: best.plan.stopPct,
        targetPct: best.plan.targetPct,
        winRate,
        avgReturnPct,
        avgHoldingDays,
        signalCount,
        filledCount: best.outcomes.length,
        atrPctMax,
      },
      create: {
        volatilityBucket: bucket,
        tradingStyle: style,
        stopPct: best.plan.stopPct,
        targetPct: best.plan.targetPct,
        winRate,
        avgReturnPct,
        avgHoldingDays,
        signalCount,
        filledCount: best.outcomes.length,
        atrPctMax,
      },
    });
  }

  return { style, buckets: results };
}

export interface LoadedOptimizedPlans {
  lowMax: number | null;
  mediumMax: number | null;
  plans: Record<VolatilityBucket, Awaited<ReturnType<typeof getOptimizedPlan>>>;
}

/** Fetches all three buckets' optimized plans + thresholds in one shot, for
 * callers (like the backtest engine) that need to classify many days
 * synchronously without a DB round-trip per signal. */
export async function loadOptimizedPlans(style: TradingStyle = "SWING"): Promise<LoadedOptimizedPlans> {
  const rows = await prisma.optimizedTradePlan.findMany({ where: { tradingStyle: style } });

  const byBucket = (bucket: VolatilityBucket) => {
    const row = rows.find((r) => r.volatilityBucket === bucket);
    if (!row) return null;
    return {
      stopPct: Number(row.stopPct),
      targetPct: Number(row.targetPct),
      winRate: row.winRate ? Number(row.winRate) : null,
      avgReturnPct: row.avgReturnPct ? Number(row.avgReturnPct) : null,
      avgHoldingDays: row.avgHoldingDays ? Number(row.avgHoldingDays) : null,
      filledCount: row.filledCount,
    };
  };

  const lowRow = rows.find((r) => r.volatilityBucket === "LOW");
  const mediumRow = rows.find((r) => r.volatilityBucket === "MEDIUM");

  return {
    lowMax: lowRow?.atrPctMax ? Number(lowRow.atrPctMax) : null,
    mediumMax: mediumRow?.atrPctMax ? Number(mediumRow.atrPctMax) : null,
    plans: { LOW: byBucket("LOW"), MEDIUM: byBucket("MEDIUM"), HIGH: byBucket("HIGH") },
  };
}

/** Synchronous classification against thresholds already loaded via
 * loadOptimizedPlans — avoids a DB query per historical signal day. */
export function classifyBucketSync(atrPct: number, loaded: LoadedOptimizedPlans): VolatilityBucket {
  if (loaded.lowMax === null || loaded.mediumMax === null) {
    if (atrPct < 2.0) return "LOW";
    if (atrPct < 3.5) return "MEDIUM";
    return "HIGH";
  }
  if (atrPct <= loaded.lowMax) return "LOW";
  if (atrPct <= loaded.mediumMax) return "MEDIUM";
  return "HIGH";
}

export async function getOptimizedPlan(
  bucket: VolatilityBucket,
  style: TradingStyle = "SWING"
): Promise<{ stopPct: number; targetPct: number; winRate: number | null; avgReturnPct: number | null; avgHoldingDays: number | null; filledCount: number } | null> {
  const row = await prisma.optimizedTradePlan.findUnique({
    where: { volatilityBucket_tradingStyle: { volatilityBucket: bucket, tradingStyle: style } },
  });
  if (!row) return null;
  return {
    stopPct: Number(row.stopPct),
    targetPct: Number(row.targetPct),
    winRate: row.winRate ? Number(row.winRate) : null,
    avgReturnPct: row.avgReturnPct ? Number(row.avgReturnPct) : null,
    avgHoldingDays: row.avgHoldingDays ? Number(row.avgHoldingDays) : null,
    filledCount: row.filledCount,
  };
}

/**
 * Classifies a stock into LOW/MEDIUM/HIGH using the real ATR% ceilings
 * recorded for each bucket at the last optimizeTradePlans() run — not
 * re-derived live per request, which would shift bucket boundaries every
 * time the universe changes and make optimized plans harder to trust
 * consistently. Falls back to a rough guess if the optimizer has never run.
 */
export async function getVolatilityBucket(atrPct: number, style: TradingStyle = "SWING"): Promise<VolatilityBucket> {
  const rows = await prisma.optimizedTradePlan.findMany({
    where: { tradingStyle: style },
    select: { volatilityBucket: true, atrPctMax: true },
  });

  const lowMax = rows.find((r) => r.volatilityBucket === "LOW")?.atrPctMax;
  const mediumMax = rows.find((r) => r.volatilityBucket === "MEDIUM")?.atrPctMax;

  if (lowMax === undefined || lowMax === null || mediumMax === undefined || mediumMax === null) {
    // Optimizer hasn't run yet for this style — rough placeholder split.
    if (atrPct < 2.0) return "LOW";
    if (atrPct < 3.5) return "MEDIUM";
    return "HIGH";
  }

  if (atrPct <= Number(lowMax)) return "LOW";
  if (atrPct <= Number(mediumMax)) return "MEDIUM";
  return "HIGH";
}
