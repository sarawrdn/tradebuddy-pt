import { getDeepSeekClient } from "@/lib/ai/deepseek";
import { getQuote } from "@/lib/market";
import type { DecisionOutput } from "@/lib/ai/types";

export type TradingStyle = "INTRADAY" | "SWING";

const BASE_PROMPT = `You are the Decision Agent for a Shariah-compliant US stock investment assistant.
Given live quote data for a single stock, produce a BUY, HOLD, SELL, or WATCH recommendation.

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

  const userPrompt = `Symbol: ${symbol}
Current price: ${quote.price}
Day change: ${quote.change} (${quote.changePercent}%)
Day open: ${quote.open}
Day high: ${quote.high}
Day low: ${quote.low}
Previous close: ${quote.previousClose}
As of: ${quote.asOf.toISOString()}

Only live intraday quote data is available (no historical candles or fundamentals yet). Reason conservatively from this alone and say so in the thesis if relevant.`;

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
