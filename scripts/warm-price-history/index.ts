import { warmPriceHistoryCache } from "../../lib/market-history";
import { prisma } from "../../lib/prisma";

async function main() {
  console.log("Warming price history cache (this takes a while — ~8s per stock)...");
  const results = await warmPriceHistoryCache();

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`Done: ${ok.length} warmed, ${failed.length} failed.`);
  for (const f of failed) console.log(`  ${f.symbol}: ${f.error}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

export {};
