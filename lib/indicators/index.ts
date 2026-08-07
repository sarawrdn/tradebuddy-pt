export interface OHLCV {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;

  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
  crossover: "BULLISH" | "BEARISH" | "NONE";
}

/**
 * Standard 12/26/9 MACD. Crossover is detected from the last two histogram
 * values — histogram flipping from negative to positive is a bullish
 * crossover (MACD line crossing above its signal line), and vice versa.
 */
export function macd(values: number[]): MacdResult | null {
  if (values.length < 35) return null; // 26 + 9 minimum for a stable signal line

  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);

  const last = histogram[histogram.length - 1];
  const prev = histogram[histogram.length - 2];

  let crossover: MacdResult["crossover"] = "NONE";
  if (prev <= 0 && last > 0) crossover = "BULLISH";
  else if (prev >= 0 && last < 0) crossover = "BEARISH";

  return {
    macd: macdLine[macdLine.length - 1],
    signal: signalLine[signalLine.length - 1],
    histogram: last,
    crossover,
  };
}

/** True range average — a measure of recent volatility, not direction. */
export function atr(candles: OHLCV[], period = 14): number | null {
  if (candles.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  return sma(trueRanges, period);
}

/** Last value of an EMA series, or null if there isn't enough history for
 * the EMA to have meaningfully converged (requires at least `period`
 * points — fewer than that and the seed value dominates the result). */
function emaLast(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return ema(values, period).at(-1) ?? null;
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  /** Where price sits within the bands: 0 = at lower band, 1 = at upper band,
   * can go outside [0,1] when price pierces a band. */
  percentB: number;
}

export function bollingerBands(values: number[], period = 20, stdDevMult = 2): BollingerBands | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const middle = slice.reduce((sum, v) => sum + v, 0) / period;
  const variance = slice.reduce((sum, v) => sum + (v - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = middle + stdDevMult * stdDev;
  const lower = middle - stdDevMult * stdDev;
  const price = values[values.length - 1];
  const percentB = upper === lower ? 0.5 : (price - lower) / (upper - lower);
  return { upper, middle, lower, percentB };
}

/**
 * Stochastic RSI: applies the stochastic %K formula to RSI values instead of
 * price, making it more sensitive to momentum shifts than plain RSI. Needs a
 * sliding window of RSI values, so it requires rsiPeriod + stochPeriod points.
 */
export function stochasticRsi(values: number[], rsiPeriod = 14, stochPeriod = 14): number | null {
  const rsiSeries: number[] = [];
  for (let end = rsiPeriod + 1; end <= values.length; end++) {
    const r = rsi(values.slice(0, end), rsiPeriod);
    if (r !== null) rsiSeries.push(r);
  }
  if (rsiSeries.length < stochPeriod) return null;

  const window = rsiSeries.slice(-stochPeriod);
  const minRsi = Math.min(...window);
  const maxRsi = Math.max(...window);
  const lastRsi = window[window.length - 1];
  if (maxRsi === minRsi) return 50;
  return ((lastRsi - minRsi) / (maxRsi - minRsi)) * 100;
}

/** On-balance volume: cumulative running total that adds volume on up days
 * and subtracts it on down days — a running gauge of buying vs selling
 * pressure. Trend is read from OBV's own 5-day change, not price. */
export function onBalanceVolume(candles: OHLCV[]): { value: number; trend: "UP" | "DOWN" | "FLAT" } | null {
  if (candles.length < 2) return null;
  let obv = 0;
  const series: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const volume = candles[i].volume ?? 0;
    if (candles[i].close > candles[i - 1].close) obv += volume;
    else if (candles[i].close < candles[i - 1].close) obv -= volume;
    series.push(obv);
  }
  const fiveAgo = series[series.length - 6] ?? series[0];
  const change = obv - fiveAgo;
  const trend: "UP" | "DOWN" | "FLAT" = change > 0 ? "UP" : change < 0 ? "DOWN" : "FLAT";
  return { value: obv, trend };
}

/** Volume-weighted average price over a rolling window, using each day's
 * typical price (H+L+C)/3 — a daily-bar approximation of intraday VWAP,
 * since true VWAP needs tick-level data we don't have. Read as "is price
 * trading above or below where volume has actually been transacting". */
export function rollingVwap(candles: OHLCV[], period = 20): number | null {
  const slice = candles.slice(-period);
  if (slice.length < period) return null;
  let sumPV = 0;
  let sumV = 0;
  for (const c of slice) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const volume = c.volume ?? 0;
    sumPV += typicalPrice * volume;
    sumV += volume;
  }
  if (sumV === 0) return null;
  return sumPV / sumV;
}

/** Rate of change: % price change over `period` days. */
export function rateOfChange(values: number[], period = 10): number | null {
  const past = values[values.length - 1 - period];
  const current = values[values.length - 1];
  if (past === undefined || current === undefined || past === 0) return null;
  return ((current - past) / past) * 100;
}

export interface TechnicalSummary {
  sma20: number | null;
  rsi14: number | null;
  trend: "UP" | "DOWN" | "FLAT";
  priceVsSma20Pct: number | null;
  fiveDayChangePct: number | null;
  macd: MacdResult | null;
  volumeRatio: number | null; // today's volume / 20-day average volume
  high20: number | null;
  low20: number | null;
  distanceFromHigh20Pct: number | null;
  distanceFromLow20Pct: number | null;
  atr14: number | null;
  atrPct: number | null; // ATR as a % of price — volatility relative to the stock's own scale
  // Extended feature set — needs longer history (up to 200 candles for
  // ema200) than the base indicators above, only populated when enough
  // candles are passed in (see getExtendedHistory).
  ema10: number | null;
  ema50: number | null;
  ema100: number | null;
  ema200: number | null;
  bollinger: BollingerBands | null;
  stochRsi: number | null;
  obv: { value: number; trend: "UP" | "DOWN" | "FLAT" } | null;
  vwap20: number | null;
  roc10: number | null;
}

export function summarizeTechnicals(candles: OHLCV[]): TechnicalSummary {
  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1] ?? null;

  const sma20 = sma(closes, 20);
  const rsi14 = rsi(closes, 14);

  const priceVsSma20Pct = currentPrice && sma20 ? ((currentPrice - sma20) / sma20) * 100 : null;

  const fiveDaysAgo = closes[closes.length - 6];
  const fiveDayChangePct =
    currentPrice && fiveDaysAgo ? ((currentPrice - fiveDaysAgo) / fiveDaysAgo) * 100 : null;

  let trend: TechnicalSummary["trend"] = "FLAT";
  if (fiveDayChangePct !== null) {
    if (fiveDayChangePct > 1) trend = "UP";
    else if (fiveDayChangePct < -1) trend = "DOWN";
  }

  const macdResult = macd(closes);

  const volumes = candles.map((c) => c.volume).filter((v): v is number => v !== null);
  const todayVolume = candles[candles.length - 1]?.volume ?? null;
  const avgVolume20 = volumes.length >= 20 ? sma(volumes, 20) : null;
  const volumeRatio = todayVolume && avgVolume20 ? todayVolume / avgVolume20 : null;

  const last20 = candles.slice(-20);
  const high20 = last20.length > 0 ? Math.max(...last20.map((c) => c.high)) : null;
  const low20 = last20.length > 0 ? Math.min(...last20.map((c) => c.low)) : null;
  const distanceFromHigh20Pct = currentPrice && high20 ? ((currentPrice - high20) / high20) * 100 : null;
  const distanceFromLow20Pct = currentPrice && low20 ? ((currentPrice - low20) / low20) * 100 : null;

  const atr14 = atr(candles, 14);
  const atrPct = atr14 && currentPrice ? (atr14 / currentPrice) * 100 : null;

  const ema10 = emaLast(closes, 10);
  const ema50 = emaLast(closes, 50);
  const ema100 = emaLast(closes, 100);
  const ema200 = emaLast(closes, 200);
  const bollinger = bollingerBands(closes, 20);
  const stochRsi = stochasticRsi(closes);
  const obv = onBalanceVolume(candles);
  const vwap20 = rollingVwap(candles, 20);
  const roc10 = rateOfChange(closes, 10);

  return {
    sma20,
    rsi14,
    trend,
    priceVsSma20Pct,
    fiveDayChangePct,
    macd: macdResult,
    volumeRatio,
    high20,
    low20,
    distanceFromHigh20Pct,
    distanceFromLow20Pct,
    atr14,
    atrPct,
    ema10,
    ema50,
    ema100,
    ema200,
    bollinger,
    stochRsi,
    obv,
    vwap20,
    roc10,
  };
}

export type TechnicalSignal = "BUY" | "WATCH" | "SELL";

export interface TechnicalSignalResult {
  signal: TechnicalSignal;
  reasoning: string[];
}

/**
 * Deterministic, rule-based read on the same indicators fed to the AI — no
 * randomness, no model variance. Meant as a sanity-check baseline to
 * compare against the AI's call, not a replacement for it.
 */
export function deriveTechnicalSignal(tech: TechnicalSummary): TechnicalSignalResult {
  const reasoning: string[] = [];

  if (tech.rsi14 === null || tech.sma20 === null || tech.priceVsSma20Pct === null) {
    return { signal: "WATCH", reasoning: ["Not enough price history yet for a rule-based read."] };
  }

  const overbought = tech.rsi14 >= 70;
  const oversold = tech.rsi14 <= 30;
  const aboveSma = tech.priceVsSma20Pct > 0;
  const belowSma = tech.priceVsSma20Pct < 0;
  const volumeConfirmed = tech.volumeRatio !== null && tech.volumeRatio >= 1.3;
  const nearResistance = tech.distanceFromHigh20Pct !== null && tech.distanceFromHigh20Pct > -1;
  const macdBullish = tech.macd?.crossover === "BULLISH" || (tech.macd !== null && tech.macd.histogram > 0);
  const macdBearish = tech.macd?.crossover === "BEARISH" || (tech.macd !== null && tech.macd.histogram < 0);

  if (overbought) {
    reasoning.push(`RSI at ${tech.rsi14.toFixed(0)} is overbought (>=70).`);
    if (nearResistance) reasoning.push("Also sitting at/near its 20-day high — limited room to run.");
    return { signal: "SELL", reasoning };
  }

  if (oversold && tech.trend !== "DOWN") {
    reasoning.push(`RSI at ${tech.rsi14.toFixed(0)} is oversold (<=30) with a non-falling trend — potential bounce.`);
    if (volumeConfirmed) reasoning.push(`Volume is ${tech.volumeRatio!.toFixed(1)}x the 20-day average — real participation, not a quiet drift.`);
    return { signal: "BUY", reasoning };
  }

  if (tech.trend === "UP" && aboveSma && tech.rsi14 > 45 && tech.rsi14 < 70) {
    reasoning.push(
      `Uptrend, price ${tech.priceVsSma20Pct.toFixed(1)}% above its 20-day average, RSI ${tech.rsi14.toFixed(0)} healthy (not overbought).`
    );
    if (macdBullish) reasoning.push("MACD histogram is positive, confirming upward momentum.");
    if (macdBearish) {
      reasoning.push("But MACD histogram is negative — momentum may be fading despite the trend. Downgrading to WATCH.");
      return { signal: "WATCH", reasoning };
    }
    if (volumeConfirmed) reasoning.push(`Volume is ${tech.volumeRatio!.toFixed(1)}x the 20-day average, supporting the move.`);
    if (nearResistance) {
      reasoning.push("However price is right at its 20-day high — a resistance level it may struggle to break through immediately.");
      return { signal: "WATCH", reasoning };
    }
    return { signal: "BUY", reasoning };
  }

  if (tech.trend === "DOWN" && belowSma) {
    reasoning.push(`Downtrend, price ${tech.priceVsSma20Pct.toFixed(1)}% below its 20-day average.`);
    if (macdBearish) reasoning.push("MACD histogram confirms negative momentum.");
    return { signal: "WATCH", reasoning };
  }

  reasoning.push("Mixed or flat signals — no clear directional edge from RSI/SMA/trend alone.");
  return { signal: "WATCH", reasoning };
}

/**
 * Deterministic holding-period estimate: how many trading days, at this
 * stock's own recent volatility (ATR), would it plausibly take to cover the
 * target distance. Assumes price makes net directional progress equal to
 * ~40% of its ATR per day when trending in your favor — a rough, stated
 * assumption, not a guarantee. Intraday is capped at "within today's
 * session" framing since it can't literally span multiple days.
 */
export function estimateHoldingPeriod(
  atrPct: number | null,
  targetPct: number,
  style: "INTRADAY" | "SWING"
): string | null {
  if (atrPct === null || atrPct <= 0) return null;

  const dailyProgressPct = atrPct * 0.4;
  const estimatedDays = targetPct / dailyProgressPct;

  if (style === "INTRADAY") {
    // Reframe as a fraction of a single session's typical range instead of
    // multiple days, since intraday trades don't span days.
    const sessionFraction = targetPct / atrPct;
    if (sessionFraction < 0.3) return "30-90 minutes";
    if (sessionFraction < 0.7) return "1-3 hours";
    if (sessionFraction < 1.2) return "3-6 hours (most of the session)";
    return "unlikely to complete within one session at this stock's typical daily range";
  }

  if (estimatedDays <= 5) return "3-5 trading days";
  if (estimatedDays <= 10) return "1-2 weeks";
  if (estimatedDays <= 20) return "2-4 weeks";
  if (estimatedDays <= 60) return "1-3 months";
  return "3+ months (slow relative to this stock's typical volatility)";
}

export interface StyleBounds {
  stopMin: number;
  stopMax: number;
  targetMin: number;
  targetMax: number;
}

// Bounds as a fraction of current price. Tight enough to avoid swing-width
// targets under an "intraday" label, loose enough to survive normal
// intraday noise plus polling-interval slippage before hitting a wall.
// This is the hard clamp for calculateTradeLevels below — the AI never
// sets these, the range itself is the safety net regardless of what
// support/resistance/ATR calculate to. Shared between the live Decision
// Agent and the backtester so both use identical rules.
export const STYLE_BOUNDS: Record<"INTRADAY" | "SWING", StyleBounds> = {
  INTRADAY: { stopMin: 0.004, stopMax: 0.015, targetMin: 0.006, targetMax: 0.025 },
  SWING: { stopMin: 0.03, stopMax: 0.1, targetMin: 0.05, targetMax: 0.2 },
};

export interface TradeLevels {
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  reasoning: string[];
}

/**
 * Calculates entry/stop-loss/take-profit deterministically from real
 * technical levels — no AI discretion over the exact price. Entry is
 * always the current live price. Stop-loss prefers the 20-day low
 * (support) if it falls within the style's allowed % range; otherwise
 * falls back to an ATR-based volatility stop. Take-profit prefers the
 * 20-day high (resistance) if in range; otherwise a 2:1 reward:risk
 * target from the stop distance. Both are always clamped to the style's
 * bounds either way, so the range itself is still the hard safety net.
 */
export function calculateTradeLevels(
  currentPrice: number,
  tech: TechnicalSummary,
  style: "INTRADAY" | "SWING",
  bounds: StyleBounds
): TradeLevels {
  const reasoning: string[] = [];
  const entryPrice = currentPrice;

  const clampPct = (pct: number, min: number, max: number) => Math.min(Math.max(pct, min), max);

  // Stop-loss
  let stopLoss: number;
  const supportDistancePct = tech.low20 !== null ? (currentPrice - tech.low20) / currentPrice : null;
  if (tech.low20 !== null && supportDistancePct !== null && supportDistancePct >= bounds.stopMin && supportDistancePct <= bounds.stopMax) {
    stopLoss = tech.low20;
    reasoning.push(
      `Stop-loss set at the 20-day low ($${tech.low20.toFixed(2)}) — real support, and it falls within the allowed ${(bounds.stopMin * 100).toFixed(1)}-${(bounds.stopMax * 100).toFixed(1)}% range for ${style.toLowerCase()}.`
    );
  } else if (tech.atr14 !== null) {
    const atrMultiplier = style === "INTRADAY" ? 1.0 : 1.5;
    const rawPct = clampPct((tech.atr14 * atrMultiplier) / currentPrice, bounds.stopMin, bounds.stopMax);
    stopLoss = currentPrice * (1 - rawPct);
    reasoning.push(
      `Stop-loss set ${(rawPct * 100).toFixed(1)}% below price using ${atrMultiplier}x ATR volatility (20-day low was outside the allowed range).`
    );
  } else {
    const midPct = (bounds.stopMin + bounds.stopMax) / 2;
    stopLoss = currentPrice * (1 - midPct);
    reasoning.push(`Stop-loss set at the midpoint of the allowed range — not enough history for a support- or volatility-based level.`);
  }

  // Take-profit
  let takeProfit: number;
  const riskDistance = currentPrice - stopLoss;
  const MIN_REWARD_RISK = 1.5;
  const resistanceDistancePct = tech.high20 !== null ? (tech.high20 - currentPrice) / currentPrice : null;
  const resistanceRewardRisk = tech.high20 !== null && riskDistance > 0 ? (tech.high20 - currentPrice) / riskDistance : null;
  if (
    tech.high20 !== null &&
    resistanceDistancePct !== null &&
    resistanceDistancePct >= bounds.targetMin &&
    resistanceDistancePct <= bounds.targetMax &&
    resistanceRewardRisk !== null &&
    resistanceRewardRisk >= MIN_REWARD_RISK
  ) {
    takeProfit = tech.high20;
    reasoning.push(
      `Take-profit set at the 20-day high ($${tech.high20.toFixed(2)}) — real resistance, within the allowed range, and still at least a ${MIN_REWARD_RISK}:1 reward-to-risk ratio.`
    );
  } else {
    const rawPct = clampPct((riskDistance * 2) / currentPrice, bounds.targetMin, bounds.targetMax);
    takeProfit = currentPrice * (1 + rawPct);
    reasoning.push(
      tech.high20 !== null && resistanceRewardRisk !== null && resistanceRewardRisk < MIN_REWARD_RISK
        ? `Take-profit set at a 2:1 reward-to-risk ratio from the stop-loss distance — the 20-day high was too close (only ${resistanceRewardRisk.toFixed(1)}:1), not worth the risk taken.`
        : `Take-profit set at a 2:1 reward-to-risk ratio from the stop-loss distance (20-day high was outside the allowed range).`
    );
  }

  return {
    entryPrice: Number(entryPrice.toFixed(2)),
    stopLoss: Number(stopLoss.toFixed(2)),
    takeProfit: Number(takeProfit.toFixed(2)),
    reasoning,
  };
}
