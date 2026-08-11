import { prisma } from "@/lib/prisma";
import { getQuote } from "@/lib/market";
import { getExtendedHistory } from "@/lib/market-history";
import { summarizeTechnicals, deriveTechnicalSignal, STYLE_BOUNDS } from "@/lib/indicators";
import { resolveTradeLevels } from "@/lib/ai/decision";
import { getSettings } from "@/lib/settings";

/**
 * Finds stocks whose most recent recommendation was WATCH — i.e. the last
 * check said "not yet, wait for confirmation" and nothing newer has been
 * generated since. Re-running these lets a WATCH flip to BUY get caught
 * without the user re-checking manually.
 */
async function getStocksNeedingRescan() {
  const stocks = await prisma.shariahStock.findMany();

  const latestPerStock = await Promise.all(
    stocks.map((stock) =>
      prisma.aIRecommendation.findFirst({
        where: { stockId: stock.id },
        orderBy: { date: "desc" },
      })
    )
  );

  return stocks.filter((_, i) => latestPerStock[i]?.recommendation === "WATCH");
}

interface RescanResult {
  symbol: string;
  previousStatus: "WATCH";
  newRecommendation: string;
  recommendationId: string;
}

// Deliberately below the 60% approve threshold: this recommendation is
// backed by the deterministic Data Signal only, never reviewed by
// DeepSeek. It's enough to trigger the upgrade notification, but not
// enough to approve a trade on — get a fresh full recommendation (which
// does call DeepSeek) first.
const DATA_SIGNAL_ONLY_CONFIDENCE = 50;

/**
 * Daily automated rescan of every WATCH stock — deliberately DeepSeek-free
 * to avoid a real API charge every single day for stocks where nothing may
 * have changed. Recomputes only the deterministic Data Signal (rule-based,
 * no AI) and the tiered price-level logic (individual walk-forward plan >
 * bucket plan > fixed rule) via resolveTradeLevels. A new recommendation
 * row is only written when the Data Signal has actually flipped to BUY —
 * no point spamming a fresh WATCH row every day when nothing changed.
 */
export async function rescanWatchStocks() {
  const stocks = await getStocksNeedingRescan();
  const settings = await getSettings();
  const style = settings.tradingStyle;
  const bounds = STYLE_BOUNDS[style];

  const results = await Promise.allSettled(
    stocks.map(async (stock): Promise<RescanResult | null> => {
      const quote = await getQuote(stock.symbol);
      const history = await getExtendedHistory(stock.symbol, 250);
      if (history.length < 6) return null;

      const tech = summarizeTechnicals(history);
      const technicalSignalResult = deriveTechnicalSignal(tech);
      if (technicalSignalResult.signal !== "BUY") return null;

      const { tradeLevels } = await resolveTradeLevels(stock.symbol, quote.price, tech, style, bounds);

      const saved = await prisma.aIRecommendation.create({
        data: {
          stockId: stock.id,
          tradingStyle: style,
          recommendation: "BUY",
          confidence: DATA_SIGNAL_ONLY_CONFIDENCE,
          entryPrice: tradeLevels.entryPrice,
          stopLoss: tradeLevels.stopLoss,
          takeProfit: tradeLevels.takeProfit,
          priceLevelReasoning: tradeLevels.reasoning,
          investmentThesis:
            "Data Signal (rule-based, no AI) upgraded to BUY during the daily automated rescan — this check is deliberately DeepSeek-free to avoid a real API charge every day. Get a fresh recommendation manually for full AI reasoning and confidence before approving a trade.",
          riskLevel: "MEDIUM",
          supportingReasons: [
            "This recommendation came from a Data-Signal-only rescan — no AI reviewed it.",
            ...technicalSignalResult.reasoning,
          ],
          technicalSignal: technicalSignalResult.signal,
          technicalReasoning: technicalSignalResult.reasoning,
        },
      });

      return {
        symbol: stock.symbol,
        previousStatus: "WATCH" as const,
        newRecommendation: "BUY",
        recommendationId: saved.id,
      };
    })
  );

  const upgradedToBuy = results
    .filter((r): r is PromiseFulfilledResult<RescanResult | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is RescanResult => v !== null);

  return { rescannedCount: stocks.length, upgradedToBuy };
}
