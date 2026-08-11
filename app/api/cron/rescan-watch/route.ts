import { NextRequest, NextResponse } from "next/server";
import { rescanWatchStocks } from "@/lib/ai/rescan-watch";

// Rechecks the deterministic Data Signal for every WATCH stock (no DeepSeek
// call — see lib/ai/rescan-watch), which can still exceed Vercel's default
// 10s Hobby-plan function timeout with enough stocks + history fetches.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await rescanWatchStocks();

  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), ...result });
}
