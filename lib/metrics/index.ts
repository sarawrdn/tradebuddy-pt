export interface TradeOutcomeLike {
  outcome: "WIN" | "LOSS";
  returnPct: number;
}

export interface RiskMetrics {
  maxDrawdownPct: number | null; // largest peak-to-trough drop in a cumulative-return equity curve
  maxConsecutiveLosses: number;
}

/**
 * Computes worst-case pain metrics from a flat sequence of trade outcomes
 * (in whatever order they actually occurred — order matters for drawdown
 * and consecutive-loss stats, unlike win rate/avg return). These answer
 * "how bad does the worst stretch get," which win rate and avg return alone
 * don't tell you.
 */
export function calculateRiskMetrics(trades: TradeOutcomeLike[]): RiskMetrics {
  if (trades.length === 0) {
    return { maxDrawdownPct: null, maxConsecutiveLosses: 0 };
  }

  // Cumulative-return equity curve (not compounded — simple sum of per-trade
  // % returns) to find the largest peak-to-trough drop.
  let cumulative = 0;
  let peak = 0;
  let maxDrawdownPct = 0;
  for (const t of trades) {
    cumulative += t.returnPct;
    peak = Math.max(peak, cumulative);
    maxDrawdownPct = Math.max(maxDrawdownPct, peak - cumulative);
  }

  let maxConsecutiveLosses = 0;
  let currentStreak = 0;
  for (const t of trades) {
    if (t.outcome === "LOSS") {
      currentStreak++;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return { maxDrawdownPct, maxConsecutiveLosses };
}
