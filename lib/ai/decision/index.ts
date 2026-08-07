import { getDeepSeekClient } from "@/lib/ai/deepseek";
import { getQuote } from "@/lib/market";
import { getDailyHistory } from "@/lib/market-history";
import {
  summarizeTechnicals,
  deriveTechnicalSignal,
  estimateHoldingPeriod,
  calculateTradeLevels,
  type StyleBounds,
} from "@/lib/indicators";
import type { DecisionOutput } from "@/lib/ai/types";

export type TradingStyle = "INTRADAY" | "SWING";

const BASE_PROMPT = `You are the Decision Agent for a Shariah-compliant US stock investment assistant.
Given live quote data and recent technical indicators for a single stock, produce a BUY, HOLD, SELL,
or WATCH recommendation.

Rules:
- Never recommend leverage, options, or short selling.
- Confidence is 0-100. Risk level is LOW, MEDIUM, or HIGH.
- Keep the investment thesis to 2-3 sentences, explainable to a retail investor.
- Do NOT set entry/stop-loss/take-profit prices — those are calculated separately from real
  support/resistance/volatility, not by you. Just decide the recommendation, confidence, and reasoning.
- Respond with ONLY a JSON object matching this TypeScript type, no markdown fences, no extra text:

{
  "recommendation": "BUY" | "HOLD" | "SELL" | "WATCH",
  "confidence": number,
  "holdingPeriod": string,
  "investmentThesis": string,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "supportingReasons": string[]
}`;

// Bounds as a fraction of current price. Tight enough to avoid swing-width
// targets under an "intraday" label, loose enough to survive normal
// intraday noise plus polling-interval slippage before hitting a wall.
// Also the hard clamp for calculateTradeLevels below — the AI never sets
// these, but the range itself is still the safety net regardless of what
// support/resistance/ATR calculate to.
const STYLE_BOUNDS: Record<TradingStyle, StyleBounds> = {
  INTRADAY: { stopMin: 0.004, stopMax: 0.015, targetMin: 0.006, targetMax: 0.025 },
  SWING: { stopMin: 0.03, stopMax: 0.1, targetMin: 0.05, targetMax: 0.2 },
};

const STYLE_LABEL: Record<TradingStyle, string> = {
  INTRADAY: `Trading style: INTRADAY (same-day).
- holdingPeriod must be expressed in minutes or hours (e.g. "1-3 hours"), never days/weeks/months.
- Prefer WATCH over BUY if today's range is too tight or too volatile for a same-day round trip to make sense.`,
  SWING: `Trading style: SWING (position hold, weeks to months).
- holdingPeriod must be expressed in weeks or months (e.g. "1-3 months").
- Day-to-day price fluctuation is expected and should not by itself trigger a SELL/WATCH downgrade.`,
};

export async function runDecisionAgent(
  symbol: string,
  style: TradingStyle = "INTRADAY"
): Promise<DecisionOutput> {
  const quote = await getQuote(symbol);
  const client = getDeepSeekClient();

  const bounds = STYLE_BOUNDS[style];
  const price = quote.price;

  const systemPrompt = `${BASE_PROMPT}

${STYLE_LABEL[style]}
- Current price is ${price}.`;

  let technicalSection = "No historical price data available — reason from the live quote alone.";
  let technicalSignalResult: { signal: "BUY" | "WATCH" | "SELL"; reasoning: string[] } | null = null;
  let technicalHoldingPeriod: string | null = null;
  let tradeLevels: { entryPrice: number; stopLoss: number; takeProfit: number; reasoning: string[] } | null = null;
  try {
    const history = await getDailyHistory(symbol);
    if (history.length >= 6) {
      const tech = summarizeTechnicals(history);
      const targetPctForStyle = ((bounds.targetMin + bounds.targetMax) / 2) * 100;
      technicalHoldingPeriod = estimateHoldingPeriod(tech.atrPct, targetPctForStyle, style);
      technicalSection = `20-day SMA: ${tech.sma20?.toFixed(2) ?? "n/a"}
14-day RSI: ${tech.rsi14?.toFixed(1) ?? "n/a"} (below 30 = oversold, above 70 = overbought)
Price vs 20-day SMA: ${tech.priceVsSma20Pct !== null ? tech.priceVsSma20Pct.toFixed(2) + "%" : "n/a"}
5-day price change: ${tech.fiveDayChangePct !== null ? tech.fiveDayChangePct.toFixed(2) + "%" : "n/a"}
5-day trend: ${tech.trend}
MACD: ${tech.macd ? `${tech.macd.histogram > 0 ? "positive" : "negative"} histogram, crossover=${tech.macd.crossover}` : "n/a (not enough history)"}
Volume vs 20-day average: ${tech.volumeRatio !== null ? tech.volumeRatio.toFixed(2) + "x" : "n/a"} (>1.3x = above-average participation, confirms conviction behind a move)
20-day high: ${tech.high20?.toFixed(2) ?? "n/a"} (price is ${tech.distanceFromHigh20Pct !== null ? tech.distanceFromHigh20Pct.toFixed(1) + "%" : "n/a"} from it — near 0% means at resistance)
20-day low: ${tech.low20?.toFixed(2) ?? "n/a"} (price is ${tech.distanceFromLow20Pct !== null ? tech.distanceFromLow20Pct.toFixed(1) + "%" : "n/a"} from it — near 0% means at support)
ATR (14-day, volatility): ${tech.atrPct !== null ? tech.atrPct.toFixed(2) + "% of price" : "n/a"} — use this to judge whether your stop/target bounds are realistic for how much this stock actually moves`;
      technicalSignalResult = deriveTechnicalSignal(tech);
      tradeLevels = calculateTradeLevels(price, tech, style, bounds);
    }
  } catch {
    // Twelve Data unavailable/rate-limited — fall back to quote-only reasoning.
  }

  if (!tradeLevels) {
    // No history available — still give a deterministic, bound-based level
    // (midpoint of the allowed range) instead of leaving it to the AI.
    const midStopPct = (bounds.stopMin + bounds.stopMax) / 2;
    const midTargetPct = (bounds.targetMin + bounds.targetMax) / 2;
    tradeLevels = {
      entryPrice: Number(price.toFixed(2)),
      stopLoss: Number((price * (1 - midStopPct)).toFixed(2)),
      takeProfit: Number((price * (1 + midTargetPct)).toFixed(2)),
      reasoning: ["No price history available — stop/target set at the midpoint of the allowed range."],
    };
  }

  const userPrompt = `Symbol: ${symbol}
Current price: ${quote.price}
Day change: ${quote.change} (${quote.changePercent}%)
Day open: ${quote.open}
Day high: ${quote.high}
Day low: ${quote.low}
Previous close: ${quote.previousClose}
As of: ${quote.asOf.toISOString()}

Technical indicators (last 20-30 trading days):
${technicalSection}

Use the technical indicators above as real evidence for your confidence level. Multiple indicators
agreeing (e.g. uptrend + healthy RSI + bullish MACD + above-average volume + room before resistance)
is legitimate grounds for real confidence — don't stay artificially conservative when the evidence
lines up. Conversely, indicators conflicting with each other (e.g. price near its 20-day high while
MACD is turning negative) is a real reason to stay cautious. Still no fundamentals or news are
available; say so in the thesis if that would materially change the call.`;

  const completion = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    // Near-zero to make the same inputs produce consistent output — with
    // 0.3 the same technical data could swing between BUY and WATCH by 30
    // confidence points from one call to the next.
    temperature: 0,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("DeepSeek returned no content");

  const decision = JSON.parse(raw) as DecisionOutput;

  // Entry/stop/target are always overridden with the calculated levels,
  // regardless of whether the AI included its own (it's instructed not to,
  // but this is the actual enforcement — never trust the AI's numbers here).
  decision.entryPrice = tradeLevels.entryPrice;
  decision.stopLoss = tradeLevels.stopLoss;
  decision.takeProfit = tradeLevels.takeProfit;
  decision.priceLevelReasoning = tradeLevels.reasoning;

  if (technicalSignalResult) {
    decision.technicalSignal = technicalSignalResult.signal;
    decision.technicalReasoning = technicalSignalResult.reasoning;
  }
  if (technicalHoldingPeriod) {
    decision.technicalHoldingPeriod = technicalHoldingPeriod;
  }

  return decision;
}
