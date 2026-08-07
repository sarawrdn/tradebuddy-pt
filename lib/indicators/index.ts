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
