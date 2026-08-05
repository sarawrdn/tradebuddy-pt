import { NextRequest, NextResponse } from "next/server";
import { getSettings, setTradingStyle } from "@/lib/settings";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { tradingStyle } = body;

  if (tradingStyle !== "INTRADAY" && tradingStyle !== "SWING") {
    return NextResponse.json({ error: "tradingStyle must be INTRADAY or SWING" }, { status: 400 });
  }

  const settings = await setTradingStyle(tradingStyle);
  return NextResponse.json({ settings });
}
