import { NextRequest, NextResponse } from "next/server";
import { scanAndAutoApprove } from "@/lib/ai/auto-trade";

// Scans every active stock (DeepSeek call each) and auto-approves anything
// that qualifies, which can exceed Vercel's default 10s Hobby-plan timeout.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await scanAndAutoApprove();
  const approved = results.filter((r) => r.autoApproved);

  return NextResponse.json({
    ok: true,
    scannedAt: new Date().toISOString(),
    scannedCount: results.length,
    autoApprovedCount: approved.length,
    results,
  });
}
