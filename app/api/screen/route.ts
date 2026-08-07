import { NextResponse } from "next/server";
import { getShariahUniverse } from "@/lib/shariah";
import { runDecisionAgent } from "@/lib/ai/decision";
import { getQuote } from "@/lib/market";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

// Scans multiple symbols in parallel (Finnhub + DeepSeek per symbol), which
// can exceed Vercel's default 10s Hobby-plan function timeout.
export const maxDuration = 60;

// Only stocks under this live price get scanned. Stocks already priced
// above it stay in the database untouched (some have real trade history
// tied to them via foreign keys) — they're just skipped going forward.
const MAX_SCAN_PRICE = 120;

interface ScanResult {
  symbol: string;
  company: string;
  shariahStatus: string;
  recommendation: Awaited<ReturnType<typeof runDecisionAgent>> & { id: string };
}

export async function GET() {
  const universe = await getShariahUniverse();
  const settings = await getSettings();

  const priceChecks = await Promise.allSettled(
    universe.map(async (stock) => ({ stock, price: (await getQuote(stock.symbol)).price }))
  );

  const underPriceCeiling = priceChecks
    .filter((r): r is PromiseFulfilledResult<{ stock: (typeof universe)[number]; price: number }> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter(({ price }) => price < MAX_SCAN_PRICE)
    .map(({ stock }) => stock);

  const results = await Promise.allSettled(
    underPriceCeiling.map(async (stock): Promise<ScanResult> => {
      const decision = await runDecisionAgent(stock.symbol, settings.tradingStyle);

      const saved = await prisma.aIRecommendation.create({
        data: {
          stockId: stock.id,
          tradingStyle: settings.tradingStyle,
          recommendation: decision.recommendation,
          confidence: decision.confidence,
          entryPrice: decision.entryPrice,
          stopLoss: decision.stopLoss,
          takeProfit: decision.takeProfit,
          holdingPeriod: decision.holdingPeriod,
          investmentThesis: decision.investmentThesis,
          riskLevel: decision.riskLevel,
          supportingReasons: decision.supportingReasons,
          technicalSignal: decision.technicalSignal,
          technicalReasoning: decision.technicalReasoning,
        },
      });

      return {
        symbol: stock.symbol,
        company: stock.company,
        shariahStatus: stock.shariahStatus,
        recommendation: { ...decision, id: saved.id },
      };
    })
  );

  const scanned = results
    .filter((r): r is PromiseFulfilledResult<ScanResult> => r.status === "fulfilled")
    .map((r) => r.value);

  const errors = results
    .map((r, i) => (r.status === "rejected" ? { symbol: underPriceCeiling[i].symbol, message: r.reason?.message } : null))
    .filter(Boolean);

  scanned.sort((a, b) => {
    const rank = (rec: string) => (rec === "BUY" ? 0 : rec === "WATCH" ? 1 : rec === "HOLD" ? 2 : 3);
    const rankDiff = rank(a.recommendation.recommendation) - rank(b.recommendation.recommendation);
    if (rankDiff !== 0) return rankDiff;
    return b.recommendation.confidence - a.recommendation.confidence;
  });

  return NextResponse.json({
    scanned,
    errors,
    skippedAboveMaxPrice: universe.length - underPriceCeiling.length,
    scannedAt: new Date().toISOString(),
  });
}
