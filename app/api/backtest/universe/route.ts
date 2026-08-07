import { NextResponse } from "next/server";
import { backtestUniverse, type TradingStyle } from "@/lib/backtest";

// Sequential per-symbol fetch at 8s spacing (Twelve Data rate limit) means a
// full universe run can exceed Vercel's function ceiling — this endpoint
// will still return whatever completed before being cut off. For a full,
// uninterrupted run use `npm run backtest:universe` locally instead.
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const style = (searchParams.get("style") as TradingStyle | null) ?? "SWING";
  const days = Number(searchParams.get("days") ?? "250");

  try {
    const summary = await backtestUniverse(style, days);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Universe backtest failed" },
      { status: 500 }
    );
  }
}
