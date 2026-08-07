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

export interface TechnicalSummary {
  sma20: number | null;
  rsi14: number | null;
  trend: "UP" | "DOWN" | "FLAT";
  priceVsSma20Pct: number | null;
  fiveDayChangePct: number | null;
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

  return { sma20, rsi14, trend, priceVsSma20Pct, fiveDayChangePct };
}

export type TechnicalSignal = "BUY" | "WATCH" | "SELL";

export interface TechnicalSignalResult {
  signal: TechnicalSignal;
  reasoning: string[];
}

/**
 * Deterministic, rule-based read on the same indicators fed to the AI — no
 * randomness, no model variance. Meant as a sanity-check baseline to
 * compare against the AI's call, not a replacement for it: it only looks
 * at RSI/SMA/trend, nothing about volume, support/resistance, or context.
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

  if (overbought) {
    reasoning.push(`RSI at ${tech.rsi14.toFixed(0)} is overbought (>=70).`);
    return { signal: "SELL", reasoning };
  }

  if (oversold && tech.trend !== "DOWN") {
    reasoning.push(`RSI at ${tech.rsi14.toFixed(0)} is oversold (<=30) with a non-falling trend — potential bounce.`);
    return { signal: "BUY", reasoning };
  }

  if (tech.trend === "UP" && aboveSma && tech.rsi14 > 45 && tech.rsi14 < 70) {
    reasoning.push(
      `Uptrend, price ${tech.priceVsSma20Pct.toFixed(1)}% above its 20-day average, RSI ${tech.rsi14.toFixed(0)} healthy (not overbought).`
    );
    return { signal: "BUY", reasoning };
  }

  if (tech.trend === "DOWN" && belowSma) {
    reasoning.push(
      `Downtrend, price ${tech.priceVsSma20Pct.toFixed(1)}% below its 20-day average.`
    );
    return { signal: "WATCH", reasoning };
  }

  reasoning.push("Mixed or flat signals — no clear directional edge from RSI/SMA/trend alone.");
  return { signal: "WATCH", reasoning };
}
