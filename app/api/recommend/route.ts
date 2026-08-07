import { NextRequest, NextResponse } from "next/server";
import { runDecisionAgent } from "@/lib/ai/decision";
import { prisma } from "@/lib/prisma";
import { getOrCreateStock } from "@/lib/shariah";
import { getSettings } from "@/lib/settings";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: "symbol query param is required" }, { status: 400 });
  }

  try {
    const settings = await getSettings();
    const decision = await runDecisionAgent(symbol, settings.tradingStyle);
    const stock = await getOrCreateStock(symbol);

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
        technicalHoldingPeriod: decision.technicalHoldingPeriod,
      },
    });

    return NextResponse.json({ symbol, recommendation: { ...decision, id: saved.id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate recommendation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
