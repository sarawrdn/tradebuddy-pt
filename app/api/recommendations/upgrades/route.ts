import { NextResponse } from "next/server";
import { getRecentUpgrades } from "@/lib/recommendations";

export async function GET() {
  const upgrades = await getRecentUpgrades();
  return NextResponse.json({ upgrades });
}
