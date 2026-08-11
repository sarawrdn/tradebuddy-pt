import { prisma } from "@/lib/prisma";
import { getShariahUniverse } from "@/lib/shariah";
import { getSettings } from "@/lib/settings";
import { runDecisionAgent } from "@/lib/ai/decision";
import { createPaperTrade, MIN_APPROVE_CONFIDENCE } from "@/lib/paper-trading";

// Same batching as /api/screen — Twelve Data's free tier rate-limits per
// minute, so firing every stock's history fetch at once causes 429s.
const BATCH_SIZE = 5;
const BATCH_GAP_MS = 3_000;

// Fixed size for every auto-approved trade — matches the UI's own default
// (the "Quantity" field on a recommendation card starts at 10). No
// risk-based position sizing yet; a human isn't picking this per trade
// anymore, so it stays simple and predictable rather than guessing at
// something smarter.
const AUTO_APPROVE_QUANTITY = 10;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AutoTradeResult {
  symbol: string;
  recommendation: string;
  confidence: number;
  recommendationId: string;
  autoApproved: boolean;
  reason?: string;
}

async function scanAndMaybeApprove(
  stock: Awaited<ReturnType<typeof getShariahUniverse>>[number],
  tradingStyle: "INTRADAY" | "SWING"
): Promise<AutoTradeResult> {
  const decision = await runDecisionAgent(stock.symbol, tradingStyle);

  const saved = await prisma.aIRecommendation.create({
    data: {
      stockId: stock.id,
      tradingStyle,
      recommendation: decision.recommendation,
      confidence: decision.confidence,
      entryPrice: decision.entryPrice,
      stopLoss: decision.stopLoss,
      takeProfit: decision.takeProfit,
      priceLevelReasoning: decision.priceLevelReasoning,
      holdingPeriod: decision.holdingPeriod,
      investmentThesis: decision.investmentThesis,
      riskLevel: decision.riskLevel,
      supportingReasons: decision.supportingReasons,
      technicalSignal: decision.technicalSignal,
      technicalReasoning: decision.technicalReasoning,
      technicalHoldingPeriod: decision.technicalHoldingPeriod,
      probabilityOfProfit: decision.probabilityOfProfit,
      expectedReturnPct: decision.expectedReturnPct,
      expectedDrawdownPct: decision.expectedDrawdownPct,
    },
  });

  const base: AutoTradeResult = {
    symbol: stock.symbol,
    recommendation: decision.recommendation,
    confidence: decision.confidence,
    recommendationId: saved.id,
    autoApproved: false,
  };

  if (decision.recommendation !== "BUY" || decision.confidence < MIN_APPROVE_CONFIDENCE || !decision.entryPrice) {
    return { ...base, reason: "did not meet BUY + confidence threshold" };
  }

  const result = await createPaperTrade({
    symbol: stock.symbol,
    recommendationId: saved.id,
    quantity: AUTO_APPROVE_QUANTITY,
    entryPrice: decision.entryPrice,
    stopLoss: decision.stopLoss,
    takeProfit: decision.takeProfit,
  });

  return result.ok ? { ...base, autoApproved: true } : { ...base, reason: result.error };
}

/**
 * Scans the full active universe (same DeepSeek-backed Decision Agent as a
 * manual "Scan Universe" click) and automatically places a paper trade for
 * anything that clears the same bar a human approval would require — BUY
 * recommendation, confidence >= MIN_APPROVE_CONFIDENCE, enough cash. No
 * click required. Real money is never involved (paper trades only), but
 * this does mean a real recurring DeepSeek cost every time it runs — see
 * the GitHub Actions schedule that calls this (currently a few times a
 * week, not daily, specifically to bound that cost).
 */
export async function scanAndAutoApprove(): Promise<AutoTradeResult[]> {
  const universe = await getShariahUniverse();
  const settings = await getSettings();

  const results: AutoTradeResult[] = [];
  for (let i = 0; i < universe.length; i += BATCH_SIZE) {
    const batch = universe.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map((stock) => scanAndMaybeApprove(stock, settings.tradingStyle)));
    for (const r of batchResults) {
      if (r.status === "fulfilled") results.push(r.value);
    }
    if (i + BATCH_SIZE < universe.length) await sleep(BATCH_GAP_MS);
  }

  return results;
}
