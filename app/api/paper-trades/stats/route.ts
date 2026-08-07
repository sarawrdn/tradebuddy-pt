import { NextResponse } from "next/server";
import { getPaperTradeStats } from "@/lib/paper-trading";

export async function GET() {
  const stats = await getPaperTradeStats();
  return NextResponse.json({
    stats,
    note:
      "Small sample sizes here are not statistically meaningful. This shows what has actually happened, not a prediction of what will happen.",
  });
}
