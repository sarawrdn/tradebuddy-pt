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
  /**
   * AI-estimated probability (0-100) that a BUY here hits a reasonable
   * profit target before a reasonable stop, reasoned from the expanded
   * indicator set (EMA10-200, Bollinger, Stochastic RSI, OBV, VWAP, ROC).
   * Distinct from `confidence`, which is conviction in the call itself.
   * Still an LLM estimate, not a statistically fitted probability — a real
   * trained model isn't feasible at our data scale (~250 days x 18 stocks).
   */
  probabilityOfProfit?: number;
  expectedReturnPct?: number;
  expectedDrawdownPct?: number;
  /**
   * Entry/stop/target are NOT AI-chosen — they're calculated deterministically
   * from real support/resistance/ATR by lib/indicators/calculateTradeLevels,
   * then clamped to the trading style's fixed % bounds. The AI has zero
   * discretion over these numbers; see priceLevelReasoning for how each was
   * derived.
   */
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  priceLevelReasoning?: string[];
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
