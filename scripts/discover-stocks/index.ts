import { discoverAndValidateCandidates } from "../../lib/discover";
import { prisma } from "../../lib/prisma";

async function main() {
  console.log("Screening candidate pool, then walk-forward validating anything that passes...\n");
  const result = await discoverAndValidateCandidates();

  const rejectedLive = result.screened.filter((s) => !s.passedLiveScreen);
  console.log(`Live screen: ${result.provisionallyIncluded.length} passed, ${rejectedLive.length} rejected.`);
  for (const r of rejectedLive) console.log(`  ${r.symbol}: ${r.reason}`);

  if (result.provisionallyIncluded.length === 0) {
    console.log("\nNothing passed the live screen — no candidates to validate.");
    return;
  }

  console.log(`\nWalk-forward validation of ${result.provisionallyIncluded.length} provisional candidates:`);
  console.log(`  Added to universe (trusted): ${result.addedToUniverse.join(", ") || "none"}`);
  console.log(`  Rejected after validation: ${result.rejectedAfterValidation.join(", ") || "none"}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

export {};
