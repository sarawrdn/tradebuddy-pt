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
}
