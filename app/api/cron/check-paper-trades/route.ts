import { NextRequest, NextResponse } from "next/server";
import { checkAndFillOrders } from "@/lib/paper-trading";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await checkAndFillOrders();

  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString() });
}
