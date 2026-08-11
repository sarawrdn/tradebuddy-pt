import { optimizeIndividualPlans } from "../../lib/optimize";
import { prisma } from "../../lib/prisma";

async function main() {
  const days = Number(process.argv[2] ?? "500");
  const numWindows = Number(process.argv[3] ?? "4");

  console.log(`Optimizing per-stock plans (${days}-day window, ${numWindows} walk-forward windows)...\n`);
  const results = await optimizeIndividualPlans("SWING", days, numWindows);

  const trusted = results.filter((r) => r.trusted);
  const untrusted = results.filter((r) => !r.trusted);

  console.log(`Trusted (${trusted.length}):`);
  for (const r of trusted) {
    console.log(
      `  ${r.symbol}: stop ${(r.stopPct * 100).toFixed(1)}%, target ${(r.targetPct * 100).toFixed(1)}% — ${r.filledCount} trades, ${r.winRate?.toFixed(0) ?? "n/a"}% WR, ${r.avgReturnPct?.toFixed(2) ?? "n/a"}% avg, walk-forward ${r.windowsPassed}/${r.totalWindows}`
    );
  }

  console.log(`\nNot trusted (${untrusted.length}):`);
  for (const r of untrusted) {
    console.log(
      `  ${r.symbol}: stop ${(r.stopPct * 100).toFixed(1)}%, target ${(r.targetPct * 100).toFixed(1)}% — ${r.filledCount} trades, ${r.winRate?.toFixed(0) ?? "n/a"}% WR, ${r.avgReturnPct?.toFixed(2) ?? "n/a"}% avg, walk-forward ${r.windowsPassed}/${r.totalWindows}`
    );
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
