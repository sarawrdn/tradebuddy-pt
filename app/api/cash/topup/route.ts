import { NextRequest, NextResponse } from "next/server";
import { topUpCash } from "@/lib/settings";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const amount = Number(body.amount);

  if (Number.isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const settings = await topUpCash(amount);
  return NextResponse.json({ settings });
}
