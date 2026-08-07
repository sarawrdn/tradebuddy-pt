import { NextResponse } from "next/server";
import { backtestSymbol, type TradingStyle } from "@/lib/backtest";

// A single symbol's extended history fetch + walk-forward simulation can
// take a while if Twelve Data isn't already cached (429 retry backoff).
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const style = (searchParams.get("style") as TradingStyle | null) ?? "SWING";
  const days = Number(searchParams.get("days") ?? "250");

  if (!symbol) {
    return NextResponse.json({ error: "symbol query param is required" }, { status: 400 });
  }

  try {
    const result = await backtestSymbol(symbol.toUpperCase(), style, days);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backtest failed" },
      { status: 500 }
    );
  }
}
