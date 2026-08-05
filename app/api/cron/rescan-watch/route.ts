import { NextRequest, NextResponse } from "next/server";
import { rescanWatchStocks } from "@/lib/ai/rescan-watch";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await rescanWatchStocks();

  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), ...result });
}
