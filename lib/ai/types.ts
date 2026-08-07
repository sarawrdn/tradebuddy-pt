export interface ResearchOutput {
  marketSummary: string;
  bullishPoints: string[];
  bearishPoints: string[];
}

export interface TechnicalOutput {
  technicalScore: number;
  trendDirection: "UP" | "DOWN" | "SIDEWAYS";
  reasoning: string;
}

export interface FundamentalOutput {
  fundamentalScore: number;
  companyHealth: string;
  valuationSummary: string;
}

export type RiskDecision = "APPROVE" | "REJECT" | "REDUCE_POSITION";

export interface RiskOutput {
  decision: RiskDecision;
  reasoning: string;
}

export type FinalRecommendation = "BUY" | "HOLD" | "SELL" | "WATCH";

export interface DecisionOutput {
  recommendation: FinalRecommendation;
  confidence: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  holdingPeriod?: string;
  investmentThesis: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  supportingReasons: string[];
  /**
   * Deterministic, rule-based read on the same indicators (RSI/SMA/trend)
   * — no model, no randomness. A sanity-check to compare against the AI's
   * `recommendation`/`confidence` above, not a replacement for it.
   */
  technicalSignal?: "BUY" | "WATCH" | "SELL";
  technicalReasoning?: string[];
  /**
   * Deterministic estimate of how long it'd plausibly take to reach the
   * target, based on this stock's own recent volatility (ATR) vs. the
   * target distance — not the AI's guess, pure math with a stated
   * assumption. See lib/indicators/estimateHoldingPeriod.
   */
  technicalHoldingPeriod?: string;
}
