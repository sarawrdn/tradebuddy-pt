import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * A stock counts as "recently upgraded" when its two most recent
 * recommendations are BUY then (immediately before) WATCH — i.e. the AI
 * changed its mind since the last check. Surfaced as an alert banner
 * instead of a push notification, since no Telegram/email is wired up yet.
 */
export async function GET() {
  const stocks = await prisma.shariahStock.findMany();

  const upgrades = (
    await Promise.all(
      stocks.map(async (stock) => {
        const lastTwo = await prisma.aIRecommendation.findMany({
          where: { stockId: stock.id },
          orderBy: { date: "desc" },
          take: 2,
        });

        if (lastTwo.length < 2) return null;
        const [latest, previous] = lastTwo;
        if (latest.recommendation !== "BUY" || previous.recommendation !== "WATCH") return null;

        return {
          symbol: stock.symbol,
          company: stock.company,
          recommendationId: latest.id,
          upgradedAt: latest.date,
        };
      })
    )
  ).filter((u): u is NonNullable<typeof u> => u !== null);

  return NextResponse.json({ upgrades });
}
