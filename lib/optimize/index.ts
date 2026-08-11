import { getExtendedHistory, type Candle } from "@/lib/market-history";
import { getShariahUniverse } from "@/lib/shariah";
import { prisma } from "@/lib/prisma";
import { summarizeTechnicals, deriveTechnicalSignal, atr } from "@/lib/indicators";
import { calculateRiskMetrics, type RiskMetrics } from "@/lib/metrics";

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
  // Only WIN/LOSS ever gets pushed to the outcomes array below — an
  // UNRESOLVED trade (never hit stop or target within MAX_HOLD_DAYS) is
  // simply skipped, not recorded with this status.
  outcome: "WIN" | "LOSS";
  returnPct: number;
  holdingDays: number;
}

/** Same signal-timing walk-forward as lib/backtest, but with a fixed
 * stop%/target% instead of calculateTradeLevels — used to grid-search which
 * stop/target combination actually performs best, instead of assuming the
 * support/resistance-based rule is right. `signalDayRange` restricts which
 * days count as signal-eligible (for TRAIN/TEST splitting) without
 * restricting how far forward a fill/resolution can look — that's still
 * real future data relative to the signal day, so no leakage either way.
 *
 * Sequential, not daily-overlapping: once a trade is taken, no new signal
 * is considered until that trade's outcome is fully known (filled+resolved,
 * filled+timed-out, or never-filled+timed-out). Scanning every single day
 * regardless of an open position would count the same underlying price move
 * as many "separate" signals during one continuous trend — inflating the
 * sample size with correlated, not independent, trades. This mirrors how
 * one actually trades a single stock: one position at a time. */
function backtestPlanOnCandles(
  candles: Candle[],
  plan: TradePlan,
  signalDayRange?: [number, number]
): PlanTradeOutcome[] {
  const outcomes: PlanTradeOutcome[] = [];
  const rangeStart = signalDayRange ? Math.max(signalDayRange[0], MIN_LOOKBACK) : MIN_LOOKBACK;
  const rangeEnd = signalDayRange ? Math.min(signalDayRange[1], candles.length) : candles.length;

  let d = rangeStart;
  while (d < rangeEnd) {
    const history = candles.slice(0, d + 1);
    const today = history[history.length - 1];

    const tech = summarizeTechnicals(history);
    const { signal } = deriveTechnicalSignal(tech);
    if (signal !== "BUY") {
      d++;
      continue;
    }

    const entryPrice = today.close;
    const stopLoss = entryPrice * (1 - plan.stopPct);
    const takeProfit = entryPrice * (1 + plan.targetPct);

    const fillDeadline = Math.min(d + MAX_FILL_WAIT_DAYS, candles.length - 1);
    let filledIndex: number | null = null;
    for (let f = d + 1; f <= fillDeadline; f++) {
      if (candles[f].low <= entryPrice) {
        filledIndex = f;
        break;
      }
    }
    if (filledIndex === null) {
      d = fillDeadline + 1;
      continue;
    }

    const holdDeadline = Math.min(filledIndex + MAX_HOLD_DAYS, candles.length - 1);
    let outcome: "WIN" | "LOSS" | "UNRESOLVED" = "UNRESOLVED";
    let holdingDays = 0;
    let resolvedIndex = holdDeadline;
    for (let r = filledIndex + 1; r <= holdDeadline; r++) {
      const c = candles[r];
      const hitStop = c.low <= stopLoss;
      const hitTarget = c.high >= takeProfit;
      holdingDays = r - filledIndex;
      if (hitStop) {
        outcome = "LOSS";
        resolvedIndex = r;
        break;
      }
      if (hitTarget) {
        outcome = "WIN";
        resolvedIndex = r;
        break;
      }
    }

    d = resolvedIndex + 1;

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

export interface SplitPerformance {
  filledCount: number;
  winRate: number | null;
  avgReturnPct: number | null;
  avgHoldingDays: number | null;
  metrics: RiskMetrics;
}

export interface BucketOptimizationResult {
  bucket: VolatilityBucket;
  symbols: string[];
  bestPlan: TradePlan;
  signalCount: number;
  /** Performance on the TRAIN portion — the data the plan was selected on.
   * Will always look at least as good as reality; don't trust this alone. */
  train: SplitPerformance;
  /** Performance on the held-out TEST portion — days never used to pick the
   * plan. This is the number that actually says whether the edge is real. */
  test: SplitPerformance;
}

export interface OptimizationSummary {
  style: TradingStyle;
  trainRatio: number;
  buckets: BucketOptimizationResult[];
}

const MIN_FILLED_FOR_VALID_PLAN = 20;

function summarizeOutcomes(outcomes: PlanTradeOutcome[]): SplitPerformance {
  if (outcomes.length === 0) {
    return {
      filledCount: 0,
      winRate: null,
      avgReturnPct: null,
      avgHoldingDays: null,
      metrics: calculateRiskMetrics([]),
    };
  }
  const wins = outcomes.filter((o) => o.outcome === "WIN");
  return {
    filledCount: outcomes.length,
    winRate: (wins.length / outcomes.length) * 100,
    avgReturnPct: outcomes.reduce((sum, o) => sum + o.returnPct, 0) / outcomes.length,
    avgHoldingDays: outcomes.reduce((sum, o) => sum + o.holdingDays, 0) / outcomes.length,
    metrics: calculateRiskMetrics(outcomes),
  };
}

/**
 * Groups the stock universe into three volatility terciles by current ATR%,
 * grid-searches stop%/target% combinations against each bucket's pooled
 * historical signals (not per-stock — too few signals per stock to avoid
 * curve-fitting), and persists the best-performing combination per bucket to
 * OptimizedTradePlan.
 *
 * Selection uses only the first `trainRatio` portion of each stock's signal
 * days ("best" = highest average return among plans with at least
 * MIN_FILLED_FOR_VALID_PLAN filled trades). The remaining held-out days are
 * never used to pick the plan — they're used afterward, once, to check how
 * that exact plan performs on data it never saw. A plan that looks great on
 * TRAIN but falls apart on TEST is the "backtest performance vs evidence of
 * robustness" gap: the persisted plan is still the TRAIN-selected one (best
 * use of all history for the live system), but both splits are returned and
 * stored so that gap is visible instead of hidden.
 */
export async function optimizeTradePlans(
  style: TradingStyle = "SWING",
  days = 250,
  trainRatio = 0.7
): Promise<OptimizationSummary> {
  const universe = await getShariahUniverse();

  const stockData: { symbol: string; candles: Candle[]; atrPct: number; trainEnd: number }[] = [];
  for (const stock of universe) {
    const candles = await getExtendedHistory(stock.symbol, days);
    const atrPct = currentAtrPct(candles);
    if (atrPct !== null && candles.length > MIN_LOOKBACK) {
      const trainEnd = MIN_LOOKBACK + Math.floor((candles.length - MIN_LOOKBACK) * trainRatio);
      stockData.push({ symbol: stock.symbol, candles, atrPct, trainEnd });
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

    let best: { plan: TradePlan; trainOutcomes: PlanTradeOutcome[] } | null = null;

    for (const plan of plans) {
      const trainOutcomes = stocksInBucket.flatMap((s) =>
        backtestPlanOnCandles(s.candles, plan, [MIN_LOOKBACK, s.trainEnd])
      );
      if (trainOutcomes.length < MIN_FILLED_FOR_VALID_PLAN) continue;

      const avgReturn = trainOutcomes.reduce((sum, o) => sum + o.returnPct, 0) / trainOutcomes.length;
      const bestAvgReturn = best
        ? best.trainOutcomes.reduce((sum, o) => sum + o.returnPct, 0) / best.trainOutcomes.length
        : -Infinity;

      if (avgReturn > bestAvgReturn) {
        best = { plan, trainOutcomes };
      }
    }

    if (!best) continue;

    const testOutcomes = stocksInBucket.flatMap((s) =>
      backtestPlanOnCandles(s.candles, best!.plan, [s.trainEnd, s.candles.length])
    );

    const train = summarizeOutcomes(best.trainOutcomes);
    const test = summarizeOutcomes(testOutcomes);

    // Total signal count includes ones that never filled, for context —
    // train/test above only count filled+resolved trades.
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
      train,
      test,
    });

    await prisma.optimizedTradePlan.upsert({
      where: { volatilityBucket_tradingStyle: { volatilityBucket: bucket, tradingStyle: style } },
      update: {
        stopPct: best.plan.stopPct,
        targetPct: best.plan.targetPct,
        winRate: train.winRate,
        avgReturnPct: train.avgReturnPct,
        avgHoldingDays: train.avgHoldingDays,
        signalCount,
        filledCount: train.filledCount,
        atrPctMax,
        oosWinRate: test.winRate,
        oosAvgReturnPct: test.avgReturnPct,
        oosFilledCount: test.filledCount,
      },
      create: {
        volatilityBucket: bucket,
        tradingStyle: style,
        stopPct: best.plan.stopPct,
        targetPct: best.plan.targetPct,
        winRate: train.winRate,
        avgReturnPct: train.avgReturnPct,
        avgHoldingDays: train.avgHoldingDays,
        signalCount,
        filledCount: train.filledCount,
        atrPctMax,
        oosWinRate: test.winRate,
        oosAvgReturnPct: test.avgReturnPct,
        oosFilledCount: test.filledCount,
      },
    });
  }

  return { style, trainRatio, buckets: results };
}

export interface OptimizedPlanData {
  stopPct: number;
  targetPct: number;
  winRate: number | null;
  avgReturnPct: number | null;
  avgHoldingDays: number | null;
  filledCount: number;
  // Out-of-sample — see the OptimizedTradePlan schema comment. Prefer these
  // over the train fields above when deciding whether to trust the edge.
  oosWinRate: number | null;
  oosAvgReturnPct: number | null;
  oosFilledCount: number | null;
}

export interface LoadedOptimizedPlans {
  lowMax: number | null;
  mediumMax: number | null;
  plans: Record<VolatilityBucket, OptimizedPlanData | null>;
}

/** Fetches all three buckets' optimized plans + thresholds in one shot, for
 * callers (like the backtest engine) that need to classify many days
 * synchronously without a DB round-trip per signal. */
export async function loadOptimizedPlans(style: TradingStyle = "SWING"): Promise<LoadedOptimizedPlans> {
  const rows = await prisma.optimizedTradePlan.findMany({ where: { tradingStyle: style } });

  const byBucket = (bucket: VolatilityBucket): OptimizedPlanData | null => {
    const row = rows.find((r) => r.volatilityBucket === bucket);
    if (!row) return null;
    return {
      stopPct: Number(row.stopPct),
      targetPct: Number(row.targetPct),
      winRate: row.winRate ? Number(row.winRate) : null,
      avgReturnPct: row.avgReturnPct ? Number(row.avgReturnPct) : null,
      avgHoldingDays: row.avgHoldingDays ? Number(row.avgHoldingDays) : null,
      filledCount: row.filledCount,
      oosWinRate: row.oosWinRate ? Number(row.oosWinRate) : null,
      oosAvgReturnPct: row.oosAvgReturnPct ? Number(row.oosAvgReturnPct) : null,
      oosFilledCount: row.oosFilledCount,
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
): Promise<OptimizedPlanData | null> {
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
    oosWinRate: row.oosWinRate ? Number(row.oosWinRate) : null,
    oosAvgReturnPct: row.oosAvgReturnPct ? Number(row.oosAvgReturnPct) : null,
    oosFilledCount: row.oosFilledCount,
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

export interface WalkForwardWindow {
  windowIndex: number;
  trainRange: [string, string]; // candle dates, inclusive
  testRange: [string, string];
  plan: TradePlan;
  train: SplitPerformance;
  test: SplitPerformance;
}

export interface WalkForwardResult {
  numWindows: number;
  windows: WalkForwardWindow[];
  /** How many windows had a positive, non-degenerate TEST result — the
   * headline number. A plan with real edge should pass most windows, not
   * just one lucky split. */
  windowsPassed: number;
  /** How much the chosen stop%/target% varied window to window — a plan
   * that picks wildly different "best" parameters each time isn't finding a
   * stable edge, it's chasing whatever noise happened to be in that
   * window's TRAIN data. Reported as the std deviation of stopPct across
   * windows, in percentage points. */
  stopPctStdDev: number | null;
}

/**
 * True rolling walk-forward validation — stronger evidence than the single
 * TRAIN/TEST split in optimizeTradePlans above, which only checks "does
 * this hold up once." Splits history into `numWindows + 1` sequential
 * chunks and, for each window, re-runs the full grid search on an
 * expanding TRAIN (from the start up to that window) and checks the result
 * on the NEXT chunk as TEST — mirroring how you'd actually re-evaluate a
 * strategy each year with more data available. A plan with genuine edge
 * should pass most windows independently, not just the one split that
 * happened to be tried. Operates on a single candle series (one stock, or
 * pre-pooled candles from multiple stocks in a bucket) rather than the
 * whole universe, since each caller may want this at different granularity.
 */
export function runWalkForwardValidation(
  candles: Candle[],
  style: TradingStyle = "SWING",
  numWindows = 4
): WalkForwardResult | null {
  const usableLength = candles.length - MIN_LOOKBACK;
  if (usableLength < numWindows * 20) return null; // not enough history to split meaningfully

  const plans = generateTradePlans(style);
  const boundaries: number[] = [MIN_LOOKBACK];
  for (let i = 1; i <= numWindows + 1; i++) {
    boundaries.push(MIN_LOOKBACK + Math.floor((usableLength * i) / (numWindows + 1)));
  }

  const windows: WalkForwardWindow[] = [];

  for (let w = 1; w <= numWindows; w++) {
    const trainStart = boundaries[0];
    const trainEnd = boundaries[w];
    const testStart = boundaries[w];
    const testEnd = boundaries[w + 1];

    let best: { plan: TradePlan; trainOutcomes: PlanTradeOutcome[] } | null = null;
    for (const plan of plans) {
      const trainOutcomes = backtestPlanOnCandles(candles, plan, [trainStart, trainEnd]);
      if (trainOutcomes.length < 5) continue; // each window has less data than a single 70/30 split
      const avgReturn = trainOutcomes.reduce((sum, o) => sum + o.returnPct, 0) / trainOutcomes.length;
      const bestAvgReturn = best
        ? best.trainOutcomes.reduce((sum, o) => sum + o.returnPct, 0) / best.trainOutcomes.length
        : -Infinity;
      if (avgReturn > bestAvgReturn) best = { plan, trainOutcomes };
    }

    if (!best) continue;

    const testOutcomes = backtestPlanOnCandles(candles, best.plan, [testStart, testEnd]);

    windows.push({
      windowIndex: w,
      trainRange: [candles[trainStart]?.date.toISOString().slice(0, 10) ?? "", candles[Math.min(trainEnd, candles.length - 1)]?.date.toISOString().slice(0, 10) ?? ""],
      testRange: [candles[testStart]?.date.toISOString().slice(0, 10) ?? "", candles[Math.min(testEnd - 1, candles.length - 1)]?.date.toISOString().slice(0, 10) ?? ""],
      plan: best.plan,
      train: summarizeOutcomes(best.trainOutcomes),
      test: summarizeOutcomes(testOutcomes),
    });
  }

  if (windows.length === 0) return null;

  const windowsPassed = windows.filter((w) => w.test.avgReturnPct !== null && w.test.avgReturnPct > 0).length;

  const stopPcts = windows.map((w) => w.plan.stopPct);
  const meanStopPct = stopPcts.reduce((s, v) => s + v, 0) / stopPcts.length;
  const stopPctStdDev =
    stopPcts.length > 1
      ? Math.sqrt(stopPcts.reduce((s, v) => s + (v - meanStopPct) ** 2, 0) / stopPcts.length) * 100
      : null;

  return { numWindows: windows.length, windows, windowsPassed, stopPctStdDev };
}
