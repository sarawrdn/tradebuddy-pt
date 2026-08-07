import { optimizeTradePlans } from "../../lib/optimize";
import { prisma } from "../../lib/prisma";

async function main() {
  console.log("Grid-searching stop/target combinations per volatility bucket (this is pure CPU work on cached candles, no external calls)...");
  const summary = await optimizeTradePlans("SWING", 250);

  for (const b of summary.buckets) {
    console.log(`\n${b.bucket} volatility (${b.symbols.join(", ")})`);
    console.log(`  Best plan: stop ${(b.bestPlan.stopPct * 100).toFixed(2)}%, target ${(b.bestPlan.targetPct * 100).toFixed(2)}%`);
    console.log(`  Signals: ${b.signalCount}, filled+resolved: ${b.filledCount}`);
    console.log(`  Win rate: ${b.winRate?.toFixed(1) ?? "n/a"}%, avg return: ${b.avgReturnPct?.toFixed(2) ?? "n/a"}%, avg holding: ${b.avgHoldingDays?.toFixed(1) ?? "n/a"} days`);
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
