import type { TechnicalOutput } from "@/lib/ai/types";

export async function runTechnicalAgent(symbol: string): Promise<TechnicalOutput> {
  throw new Error(`runTechnicalAgent not implemented for ${symbol}`);
}
