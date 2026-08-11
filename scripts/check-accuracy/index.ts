import { checkSystemAccuracy } from "../../lib/accuracy";
import { prisma } from "../../lib/prisma";

async function main() {
  const reports = await checkSystemAccuracy();

  if (reports.length === 0) {
    console.log("No closed paper trades yet — nothing to compare. Run this again once trades have resolved.");
    return;
  }

  console.log("Live paper-trade results vs backtested predictions:\n");
  for (const r of reports) {
    console.log(`${r.symbol}: ${r.liveTrades} live trades, ${r.liveWinRate?.toFixed(0) ?? "n/a"}% WR, ${r.liveAvgReturnPct?.toFixed(2) ?? "n/a"}% avg`);
    console.log(
      `  Predicted (${r.predictedSource}): ${r.predictedWinRate?.toFixed(0) ?? "n/a"}% WR, ${r.predictedAvgReturnPct?.toFixed(2) ?? "n/a"}% avg`
    );
    if (r.driftPct !== null) {
      console.log(`  Drift: ${r.driftPct >= 0 ? "+" : ""}${r.driftPct.toFixed(2)} percentage points vs prediction`);
    }
    console.log(`  Verdict: ${r.verdict}\n`);
  }

  const diverging = reports.filter((r) => r.verdict === "diverging — investigate");
  if (diverging.length > 0) {
    console.log(`⚠ ${diverging.length} stock(s) diverging from prediction: ${diverging.map((r) => r.symbol).join(", ")}`);
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
