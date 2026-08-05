import { getDeepSeekClient } from "@/lib/ai/deepseek";
import { getQuote } from "@/lib/market";
import type { DecisionOutput } from "@/lib/ai/types";

const SYSTEM_PROMPT = `You are the Decision Agent for a Shariah-compliant US stock investment assistant.
Given live quote data for a single stock, produce a BUY, HOLD, SELL, or WATCH recommendation.

Rules:
- Never recommend leverage, options, or short selling.
- Entry price, stop loss, and take profit must be realistic relative to the current price and the day's range.
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

export async function runDecisionAgent(symbol: string): Promise<DecisionOutput> {
  const quote = await getQuote(symbol);
  const client = getDeepSeekClient();

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
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("DeepSeek returned no content");

  return JSON.parse(raw) as DecisionOutput;
}
