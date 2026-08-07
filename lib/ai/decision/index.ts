import { getDeepSeekClient } from "@/lib/ai/deepseek";
import { getQuote } from "@/lib/market";
import { getDailyHistory } from "@/lib/market-history";
import { summarizeTechnicals } from "@/lib/indicators";
import type { DecisionOutput } from "@/lib/ai/types";

export type TradingStyle = "INTRADAY" | "SWING";

const BASE_PROMPT = `You are the Decision Agent for a Shariah-compliant US stock investment assistant.
Given live quote data and recent technical indicators for a single stock, produce a BUY, HOLD, SELL,
or WATCH recommendation.

Rules:
- Never recommend leverage, options, or short selling.
- Confidence is 0-100. Risk level is LOW, MEDIUM, or HIGH.
- Keep the investment thesis to 2-3 sentences, explainable to a retail investor.
- Respond with ONLY a JSON object matching this TypeScript type, no markdown fences, no extra text:

{
  "recommendation": "BUY" | "HOLD" | "SELL" | "WATCH",
  "confidence": number,
  "entryPrice": number,
  "stopLoss": number,
  "takeProfit": number,
  "holdingPeriod": string,
  "investmentThesis": string,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "supportingReasons": string[]
}`;

// Bounds as a fraction of current price. Tight enough to avoid swing-width
// targets under an "intraday" label, loose enough to survive normal
// intraday noise plus polling-interval slippage before hitting a wall.
const STYLE_BOUNDS: Record<TradingStyle, { stopMin: number; stopMax: number; targetMin: number; targetMax: number }> = {
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
  const stopFloor = (price * (1 - bounds.stopMax)).toFixed(2);
  const stopCeil = (price * (1 - bounds.stopMin)).toFixed(2);
  const targetFloor = (price * (1 + bounds.targetMin)).toFixed(2);
  const targetCeil = (price * (1 + bounds.targetMax)).toFixed(2);

  const systemPrompt = `${BASE_PROMPT}

${STYLE_LABEL[style]}
- Current price is ${price}. If recommending BUY or WATCH, stopLoss MUST be between ${stopFloor} and ${stopCeil}, and takeProfit MUST be between ${targetFloor} and ${targetCeil}. These bounds are fixed for this trading style — do not go outside them even if you think the stock deserves a wider or tighter range; that's a signal to change the recommendation or confidence instead, not the bounds.`;

  let technicalSection = "No historical price data available — reason from the live quote alone.";
  try {
    const history = await getDailyHistory(symbol);
    if (history.length >= 6) {
      const tech = summarizeTechnicals(history);
      technicalSection = `20-day SMA: ${tech.sma20?.toFixed(2) ?? "n/a"}
14-day RSI: ${tech.rsi14?.toFixed(1) ?? "n/a"} (below 30 = oversold, above 70 = overbought)
Price vs 20-day SMA: ${tech.priceVsSma20Pct !== null ? tech.priceVsSma20Pct.toFixed(2) + "%" : "n/a"}
5-day price change: ${tech.fiveDayChangePct !== null ? tech.fiveDayChangePct.toFixed(2) + "%" : "n/a"}
5-day trend: ${tech.trend}`;
    }
  } catch {
    // Twelve Data unavailable/rate-limited — fall back to quote-only reasoning.
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

Use the technical indicators above as real evidence for your confidence level — a clear trend with
supporting RSI is legitimate grounds for higher confidence than quote data alone. Still no fundamentals
or news are available; say so in the thesis if that would materially change the call.`;

  const completion = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("DeepSeek returned no content");

  return JSON.parse(raw) as DecisionOutput;
}
