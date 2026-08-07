import { backtestUniverse } from "../../lib/backtest";
import { prisma } from "../../lib/prisma";

async function main() {
  console.log("Backtesting full stock universe (this takes a while — ~8s per stock)...");
  const summary = await backtestUniverse("SWING", 250);

  console.log(`\nStocks: ${summary.ok}/${summary.totalStocks} ok, ${summary.failed.length} failed`);
  for (const f of summary.failed) console.log(`  ${f.symbol}: ${f.error}`);

  console.log(`\nTotal signals: ${summary.totalSignals}`);
  console.log(`Filled: ${summary.totalFilled}`);
  console.log(`Wins: ${summary.totalWins}  Losses: ${summary.totalLosses}  Unresolved: ${summary.totalUnresolved}`);
  console.log(`Overall win rate: ${summary.overallWinRate?.toFixed(1) ?? "n/a"}%`);
  console.log(`Overall avg return: ${summary.overallAvgReturnPct?.toFixed(2) ?? "n/a"}%`);

  console.log("\nPer-stock:");
  for (const r of summary.results) {
    console.log(
      `  ${r.symbol}: ${r.totalSignals} signals, ${r.filled} filled, ${r.wins}W/${r.losses}L/${r.unresolved}U, winRate=${r.winRate?.toFixed(0) ?? "n/a"}%, avgReturn=${r.avgReturnPct?.toFixed(2) ?? "n/a"}%`
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
