import { optimizeTradePlans } from "../../lib/optimize";
import { prisma } from "../../lib/prisma";

async function main() {
  const days = Number(process.argv[2] ?? "250");
  console.log(`Grid-searching stop/target combinations per volatility bucket (window: ${days} days, pure CPU work on cached candles, no external calls)...`);
  const summary = await optimizeTradePlans("SWING", days);
  console.log(`Train/test split: ${(summary.trainRatio * 100).toFixed(0)}% train, ${((1 - summary.trainRatio) * 100).toFixed(0)}% held-out test.\n`);

  for (const b of summary.buckets) {
    console.log(`${b.bucket} volatility (${b.symbols.join(", ")})`);
    console.log(`  Best plan (selected on TRAIN only): stop ${(b.bestPlan.stopPct * 100).toFixed(2)}%, target ${(b.bestPlan.targetPct * 100).toFixed(2)}%`);
    console.log(`  Total signals across full window: ${b.signalCount}`);
    console.log(
      `  TRAIN  (in-sample, used to pick the plan): ${b.train.filledCount} trades, win rate ${b.train.winRate?.toFixed(1) ?? "n/a"}%, avg return ${b.train.avgReturnPct?.toFixed(2) ?? "n/a"}%, max DD ${b.train.metrics.maxDrawdownPct?.toFixed(1) ?? "n/a"}%, max consec. losses ${b.train.metrics.maxConsecutiveLosses}`
    );
    console.log(
      `  TEST   (held-out, never used to pick the plan): ${b.test.filledCount} trades, win rate ${b.test.winRate?.toFixed(1) ?? "n/a"}%, avg return ${b.test.avgReturnPct?.toFixed(2) ?? "n/a"}%, max DD ${b.test.metrics.maxDrawdownPct?.toFixed(1) ?? "n/a"}%, max consec. losses ${b.test.metrics.maxConsecutiveLosses}`
    );
    if (b.test.avgReturnPct !== null && b.train.avgReturnPct !== null && b.test.avgReturnPct < b.train.avgReturnPct * 0.5) {
      console.log(`  ⚠ TEST significantly underperforms TRAIN — possible overfitting, treat this bucket's edge with skepticism.`);
    }
    console.log("");
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
