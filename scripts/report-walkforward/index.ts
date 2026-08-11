import { reportWalkForwardValidation } from "../../lib/optimize";
import { prisma } from "../../lib/prisma";

async function main() {
  const days = Number(process.argv[2] ?? "500");
  const numWindows = Number(process.argv[3] ?? "4");

  console.log(`Bucket-level walk-forward validation (${days}-day window, ${numWindows} rolling windows) — REPORTING ONLY, nothing persisted.\n`);

  const results = await reportWalkForwardValidation("SWING", days, numWindows);

  for (const r of results) {
    console.log(`${r.bucket} volatility (${r.symbols.join(", ")})`);
    for (const w of r.windows) {
      console.log(
        `  Window ${w.windowIndex}: plan stop=${(w.plan.stopPct * 100).toFixed(1)}% target=${(w.plan.targetPct * 100).toFixed(1)}% — TRAIN ${w.train.filledCount}t ${w.train.winRate?.toFixed(0) ?? "n/a"}%/${w.train.avgReturnPct?.toFixed(2) ?? "n/a"}% | TEST ${w.test.filledCount}t ${w.test.winRate?.toFixed(0) ?? "n/a"}%/${w.test.avgReturnPct?.toFixed(2) ?? "n/a"}%`
      );
    }
    console.log(`  Windows passed: ${r.windowsPassed}/${r.windows.length}`);
    console.log(`  Stop% stability (std dev): ${r.stopPctStdDev?.toFixed(2) ?? "n/a"} percentage points\n`);
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
