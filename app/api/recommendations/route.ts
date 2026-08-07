import { NextResponse } from "next/server";
import { getLatestRecommendations } from "@/lib/recommendations";

export async function GET() {
  const { intraday, swing } = await getLatestRecommendations();
  return NextResponse.json({ intraday, swing });
}
