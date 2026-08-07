/** Reward-to-risk ratio from the trade's own price levels — how many
 * dollars of upside per dollar risked. Null if levels are missing or the
 * stop isn't actually below entry (shouldn't happen, but guards div-by-0). */
export function calculateRiskReward(
  entryPrice?: number,
  stopLoss?: number,
  takeProfit?: number
): number | null {
  if (entryPrice === undefined || stopLoss === undefined || takeProfit === undefined) return null;
  const risk = entryPrice - stopLoss;
  const reward = takeProfit - entryPrice;
  if (risk <= 0) return null;
  return reward / risk;
}

/**
 * A deterministic 1-5 star summary of a trade's overall quality, blending
 * three already-computed numbers: AI confidence (20% weight), AI-estimated
 * probability of profit (40%), and the reward:risk ratio of the price
 * levels themselves (40%, capped at 3:1 — beyond that more reward:risk
 * doesn't make a trade meaningfully "better" for this purpose). Pure
 * presentation math over existing fields, not a new trading signal.
 */
export function calculateTradeQualityStars(
  confidence: number,
  probabilityOfProfit?: number,
  riskReward?: number | null
): number {
  let score = (confidence / 100) * 20;
  if (probabilityOfProfit !== undefined) score += (probabilityOfProfit / 100) * 40;
  if (riskReward !== null && riskReward !== undefined) score += Math.min(riskReward / 3, 1) * 40;
  const stars = Math.round(score / 20);
  return Math.max(1, Math.min(5, stars));
}
