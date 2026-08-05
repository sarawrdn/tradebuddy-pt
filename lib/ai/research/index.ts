import type { ResearchOutput } from "@/lib/ai/types";

export async function runResearchAgent(symbol: string): Promise<ResearchOutput> {
  throw new Error(`runResearchAgent not implemented for ${symbol}`);
}
