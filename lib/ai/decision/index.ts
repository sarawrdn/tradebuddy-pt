import { getDeepSeekClient } from "@/lib/ai/deepseek";
import { getQuote } from "@/lib/market";
import { getExtendedHistory } from "@/lib/market-history";
import { prisma } from "@/lib/prisma";
import {
  summarizeTechnicals,
  deriveTechnicalSignal,
  estimateHoldingPeriod,
  calculateTradeLevels,
  STYLE_BOUNDS,
} from "@/lib/indicators";
import { getVolatilityBucket, getOptimizedPlan, getIndividualPlan } from "@/lib/optimize";
import type { DecisionOutput } from "@/lib/ai/types";

export type TradingStyle = "INTRADAY" | "SWING";

const BASE_PROMPT = `You are the Decision Agent for a Shariah-compliant US stock investment assistant.
Given live quote data and a broad set of technical indicators (trend, momentum, volatility, and
volume) for a single stock, produce a BUY, HOLD, SELL, or WATCH recommendation along with a
probability-style read on how likely a BUY is to work out.

Rules:
- Never recommend leverage, options, or short selling.
- Confidence is 0-100 — your overall conviction in the recommendation itself.
- probabilityOfProfit is 0-100 — specifically, if this were bought now, how likely is it to hit a
  reasonable profit target before a reasonable stop-loss, based on how the indicators below have
  historically resolved in similar setups. This can differ from confidence: you can be highly
  confident in a HOLD/WATCH call while probabilityOfProfit stays low because there's no live setup.
- expectedReturnPct and expectedDrawdownPct are your best-effort estimates (can be 0 or omitted
  logic aside — always provide a number) of the size of the move and the risk of pullback before
  it plays out, as percentages. These are estimates for context, not guarantees.
- Weigh which indicators actually matter for this specific setup and say so in supportingReasons —
  don't treat every indicator as equally important every time.
- Risk level is LOW, MEDIUM, or HIGH.
- Keep the investment thesis to 2-3 sentences, explainable to a retail investor.
- Do NOT set entry/stop-loss/take-profit prices — those are calculated separately from real
  support/resistance/volatility, not by you. Just decide the recommendation, confidence, and reasoning.
- Respond with ONLY a JSON object matching this TypeScript type, no markdown fences, no extra text:

{
  "recommendation": "BUY" | "HOLD" | "SELL" | "WATCH",
  "confidence": number,
  "probabilityOfProfit": number,
  "expectedReturnPct": number,
  "expectedDrawdownPct": number,
  "holdingPeriod": string,
  "investmentThesis": string,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "supportingReasons": string[]
}`;

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
    // 250 days (not just the ~45 needed for MACD/ATR) so ema200/Bollinger/
    // StochRSI have enough history to actually converge.
    const history = await getExtendedHistory(symbol, 250);
    if (history.length >= 6) {
      const tech = summarizeTechnicals(history);
      const targetPctForStyle = ((bounds.targetMin + bounds.targetMax) / 2) * 100;
      technicalHoldingPeriod = estimateHoldingPeriod(tech.atrPct, targetPctForStyle, style);
      technicalSection = `Trend:
- 20-day SMA: ${tech.sma20?.toFixed(2) ?? "n/a"}, price vs it: ${tech.priceVsSma20Pct !== null ? tech.priceVsSma20Pct.toFixed(2) + "%" : "n/a"}
- EMA10/50/100/200: ${tech.ema10?.toFixed(2) ?? "n/a"} / ${tech.ema50?.toFixed(2) ?? "n/a"} / ${tech.ema100?.toFixed(2) ?? "n/a"} / ${tech.ema200?.toFixed(2) ?? "n/a"} — shorter EMA above longer EMA suggests an intact uptrend at that timeframe
- 5-day trend: ${tech.trend}, 5-day change: ${tech.fiveDayChangePct !== null ? tech.fiveDayChangePct.toFixed(2) + "%" : "n/a"}
- 10-day rate of change: ${tech.roc10 !== null ? tech.roc10.toFixed(2) + "%" : "n/a"}

Momentum:
- 14-day RSI: ${tech.rsi14?.toFixed(1) ?? "n/a"} (below 30 = oversold, above 70 = overbought)
- Stochastic RSI: ${tech.stochRsi !== null ? tech.stochRsi.toFixed(1) : "n/a"} (0-100, more sensitive/faster than plain RSI — extremes near 0 or 100 suggest a turn is more likely)
- MACD: ${tech.macd ? `${tech.macd.histogram > 0 ? "positive" : "negative"} histogram, crossover=${tech.macd.crossover}` : "n/a (not enough history)"}

Volatility:
- ATR (14-day): ${tech.atrPct !== null ? tech.atrPct.toFixed(2) + "% of price" : "n/a"} — use this to judge whether stop/target bounds are realistic for how much this stock actually moves
- Bollinger Bands (20-day, 2 std dev): ${tech.bollinger ? `upper ${tech.bollinger.upper.toFixed(2)}, middle ${tech.bollinger.middle.toFixed(2)}, lower ${tech.bollinger.lower.toFixed(2)}, %B=${tech.bollinger.percentB.toFixed(2)}` : "n/a"} (%B near 1 = price at upper band/expensive relative to recent range, near 0 = at lower band/cheap)

Volume:
- Volume vs 20-day average: ${tech.volumeRatio !== null ? tech.volumeRatio.toFixed(2) + "x" : "n/a"} (>1.3x = above-average participation, confirms conviction behind a move)
- On-balance volume trend (5-day): ${tech.obv?.trend ?? "n/a"} (rising OBV while price is flat/down can be an early accumulation signal; falling OBV while price rises is a warning sign)
- 20-day rolling VWAP: ${tech.vwap20?.toFixed(2) ?? "n/a"} (price above this means recent buyers are, on average, in profit — support tends to hold better here)

Price levels:
- 20-day high: ${tech.high20?.toFixed(2) ?? "n/a"} (price is ${tech.distanceFromHigh20Pct !== null ? tech.distanceFromHigh20Pct.toFixed(1) + "%" : "n/a"} from it — near 0% means at resistance)
- 20-day low: ${tech.low20?.toFixed(2) ?? "n/a"} (price is ${tech.distanceFromLow20Pct !== null ? tech.distanceFromLow20Pct.toFixed(1) + "%" : "n/a"} from it — near 0% means at support)`;
      technicalSignalResult = deriveTechnicalSignal(tech);

      // Individual per-stock plan takes priority — it's validated with real
      // rolling walk-forward evidence (multiple independent windows), not
      // just a single train/test split. Only ever returned if `trusted`
      // (passed at least half its walk-forward windows) — see
      // lib/optimize/getIndividualPlan and optimizeIndividualPlans.
      let individualPlan: Awaited<ReturnType<typeof getIndividualPlan>> = null;
      if (style === "SWING") {
        individualPlan = await getIndividualPlan(symbol, style);
        if (individualPlan) {
          const stopLoss = price * (1 - individualPlan.stopPct);
          const takeProfit = price * (1 + individualPlan.targetPct);
          tradeLevels = {
            entryPrice: Number(price.toFixed(2)),
            stopLoss: Number(stopLoss.toFixed(2)),
            takeProfit: Number(takeProfit.toFixed(2)),
            reasoning: [
              `Entry/stop/target from a plan optimized on this stock's own history: stop ${(individualPlan.stopPct * 100).toFixed(1)}%, target ${(individualPlan.targetPct * 100).toFixed(1)}% — ${individualPlan.winRate?.toFixed(0) ?? "n/a"}% win rate, ${individualPlan.avgReturnPct !== null && individualPlan.avgReturnPct >= 0 ? "+" : ""}${individualPlan.avgReturnPct?.toFixed(2) ?? "n/a"}% avg return across ${individualPlan.filledCount} of this stock's own historical trades, validated by passing ${individualPlan.windowsPassed}/${individualPlan.totalWindows} independent rolling walk-forward windows.`,
            ],
          };
          technicalSection += `\n\nBacktested evidence specific to this stock (not a pooled group): ${individualPlan.filledCount} historical trades, ${individualPlan.winRate?.toFixed(0) ?? "n/a"}% win rate, ${individualPlan.avgReturnPct !== null && individualPlan.avgReturnPct >= 0 ? "+" : ""}${individualPlan.avgReturnPct?.toFixed(2) ?? "n/a"}% avg return, and it passed ${individualPlan.windowsPassed} of ${individualPlan.totalWindows} independent rolling walk-forward windows — real, stock-specific evidence, not a group average. Weigh this heavily when setting probabilityOfProfit.`;
        }
      }

      // Fall back to the volatility-bucket plan (pooled across similar
      // stocks) only if this stock doesn't have enough individual history
      // to validate on its own yet.
      const MIN_OOS_FILLED = 10;
      let optimizedPlan: Awaited<ReturnType<typeof getOptimizedPlan>> = null;
      if (!tradeLevels && tech.atrPct !== null && style === "SWING") {
        const bucket = await getVolatilityBucket(tech.atrPct, style);
        optimizedPlan = await getOptimizedPlan(bucket, style);
        if (optimizedPlan && optimizedPlan.filledCount >= 20 && (optimizedPlan.oosFilledCount ?? 0) >= MIN_OOS_FILLED) {
          const stopLoss = price * (1 - optimizedPlan.stopPct);
          const takeProfit = price * (1 + optimizedPlan.targetPct);
          tradeLevels = {
            entryPrice: Number(price.toFixed(2)),
            stopLoss: Number(stopLoss.toFixed(2)),
            takeProfit: Number(takeProfit.toFixed(2)),
            reasoning: [
              `Entry/stop/target from a backtested-optimal plan for this stock's volatility bucket (${bucket}): stop ${(optimizedPlan.stopPct * 100).toFixed(1)}%, target ${(optimizedPlan.targetPct * 100).toFixed(1)}% — held-out (out-of-sample) test: ${optimizedPlan.oosWinRate?.toFixed(0) ?? "n/a"}% win rate, ${optimizedPlan.oosAvgReturnPct !== null && optimizedPlan.oosAvgReturnPct >= 0 ? "+" : ""}${optimizedPlan.oosAvgReturnPct?.toFixed(2) ?? "n/a"}% avg return across ${optimizedPlan.oosFilledCount} trades never used to pick this plan.`,
            ],
          };
        }
      }

      if (!tradeLevels) {
        tradeLevels = calculateTradeLevels(price, tech, style, bounds);
      }

      if (optimizedPlan) {
        const overfitWarning =
          optimizedPlan.oosAvgReturnPct !== null &&
          optimizedPlan.avgReturnPct !== null &&
          optimizedPlan.oosAvgReturnPct < optimizedPlan.avgReturnPct * 0.5
            ? " Note: held-out performance is notably weaker than the in-sample number this plan was selected on — treat this bucket's edge with real skepticism."
            : "";
        technicalSection += `\n\nBacktested evidence for this stock's volatility bucket, held-out/out-of-sample only (${optimizedPlan.oosFilledCount ?? 0} trades never used to select this plan): win rate ${optimizedPlan.oosWinRate?.toFixed(0) ?? "n/a"}%, avg return ${optimizedPlan.oosAvgReturnPct !== null && optimizedPlan.oosAvgReturnPct >= 0 ? "+" : ""}${optimizedPlan.oosAvgReturnPct?.toFixed(2) ?? "n/a"}%. Weigh this real historical performance when setting probabilityOfProfit — don't ignore it in favor of how the setup merely looks today.${overfitWarning}`;
      }
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

  // Clamp AI-estimated numeric fields to sane ranges — these are context
  // estimates, not enforced values, but a malformed or out-of-range number
  // shouldn't corrupt the stored recommendation.
  if (typeof decision.probabilityOfProfit === "number") {
    decision.probabilityOfProfit = Math.min(Math.max(decision.probabilityOfProfit, 0), 100);
  }
  if (typeof decision.expectedReturnPct !== "number" || !Number.isFinite(decision.expectedReturnPct)) {
    decision.expectedReturnPct = undefined;
  }
  if (typeof decision.expectedDrawdownPct !== "number" || !Number.isFinite(decision.expectedDrawdownPct)) {
    decision.expectedDrawdownPct = undefined;
  }

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

  // Backtest gate: if this stock's own historical backtest of the Data
  // Signal + calculated price levels came out net-negative, refuse to let
  // a BUY through regardless of what the AI says — a call that already
  // proved to lose money on this exact stock isn't worth trading again
  // just because the setup looks similar today.
  if (decision.recommendation === "BUY") {
    const stock = await prisma.shariahStock.findUnique({ where: { symbol } });
    const avgReturn = stock?.backtestAvgReturnPct ? Number(stock.backtestAvgReturnPct) : null;
    if (avgReturn !== null && avgReturn < 0) {
      decision.recommendation = "WATCH";
      decision.supportingReasons = [
        `Downgraded from BUY: this stock's backtested Data Signal history shows a net-negative average return (${avgReturn.toFixed(2)}%) — refusing to trade a setup that already proved to lose money here.`,
        ...decision.supportingReasons,
      ];
    }
  }

  return decision;
}
