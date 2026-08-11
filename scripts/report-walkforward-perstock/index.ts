import { getExtendedHistory } from "../../lib/market-history";
import { runWalkForwardValidation } from "../../lib/optimize";
import { getShariahUniverse } from "../../lib/shariah";
import { prisma } from "../../lib/prisma";

async function main() {
  const days = Number(process.argv[2] ?? "500");
  const numWindows = Number(process.argv[3] ?? "4");

  const universe = await getShariahUniverse();
  console.log(`Per-stock walk-forward validation (${days}-day window, ${numWindows} rolling windows) for ${universe.length} stocks.\n`);

  for (const stock of universe) {
    try {
      const candles = await getExtendedHistory(stock.symbol, days);
      const result = runWalkForwardValidation(candles, "SWING", numWindows);

      if (!result) {
        console.log(`${stock.symbol}: not enough history for ${numWindows} windows`);
        continue;
      }

      const testReturns = result.windows.map((w) => w.test.avgReturnPct);
      const summary = testReturns.map((r) => (r !== null ? `${r >= 0 ? "+" : ""}${r.toFixed(1)}%` : "n/a")).join(", ");
      console.log(
        `${stock.symbol}: ${result.windowsPassed}/${result.numWindows} windows passed — TEST returns per window: [${summary}] — stop% stability (stddev): ${result.stopPctStdDev?.toFixed(2) ?? "n/a"}pp`
      );
    } catch (err) {
      console.log(`${stock.symbol}: ERROR — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

export {};
