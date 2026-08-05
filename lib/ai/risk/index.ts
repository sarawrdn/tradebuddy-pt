import type { RiskOutput } from "@/lib/ai/types";

export async function runRiskAgent(symbol: string, proposedQuantity: number): Promise<RiskOutput> {
  throw new Error(`runRiskAgent not implemented for ${symbol} (qty ${proposedQuantity})`);
}
