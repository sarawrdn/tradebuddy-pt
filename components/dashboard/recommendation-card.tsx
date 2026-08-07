"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { DecisionOutput } from "@/lib/ai/types";
import { safeJson } from "@/lib/utils";

const REC_STYLES: Record<string, string> = {
  BUY: "bg-emerald-100 text-emerald-700",
  HOLD: "bg-amber-100 text-amber-700",
  SELL: "bg-red-100 text-red-700",
  WATCH: "bg-slate-100 text-slate-700",
};

export type Recommendation = DecisionOutput & { id: string };

// 70% never occurs in practice: the Decision Agent only has today's live
// quote to reason from (no historical/fundamental data), so it correctly
// stays in a 45-65% confidence band. 60% matches the top of that realistic
// range instead of an unreachable bar.
const MIN_APPROVE_CONFIDENCE = 60;

export function RecommendationCard({
  symbol,
  company,
  recommendation,
  dateGenerated,
}: {
  symbol: string;
  company?: string;
  recommendation: Recommendation;
  dateGenerated?: string;
}) {
  const [quantity, setQuantity] = useState("10");
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligibleType = recommendation.recommendation === "BUY";
  const meetsConfidence = recommendation.confidence >= MIN_APPROVE_CONFIDENCE;
  const showApproveSection = eligibleType && !!recommendation.entryPrice;
  const qtyNumber = Number(quantity);
  const totalCost =
    recommendation.entryPrice && !Number.isNaN(qtyNumber) ? recommendation.entryPrice * qtyNumber : null;

  async function approve() {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch("/api/paper-trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          recommendationId: recommendation.id,
          quantity,
          entryPrice: recommendation.entryPrice,
          stopLoss: recommendation.stopLoss,
          takeProfit: recommendation.takeProfit,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error ?? "Failed to approve trade");
      setApproved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve trade");
    } finally {
      setApproving(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold">{symbol}</p>
          {company && <p className="text-xs text-muted-foreground">{company}</p>}
          {dateGenerated && (
            <p className="text-xs text-muted-foreground">{new Date(dateGenerated).toLocaleString()}</p>
          )}
        </div>
        <Badge className={REC_STYLES[recommendation.recommendation]} variant="secondary">
          {recommendation.recommendation}
        </Badge>
      </div>

      {recommendation.technicalSignal && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">AI Signal (DeepSeek)</p>
            <Badge className={REC_STYLES[recommendation.recommendation]} variant="secondary">
              {recommendation.recommendation}
            </Badge>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">Data Signal (rule-based, no AI)</p>
            <Badge className={REC_STYLES[recommendation.technicalSignal]} variant="secondary">
              {recommendation.technicalSignal}
            </Badge>
          </div>
          {recommendation.technicalSignal !== recommendation.recommendation && (
            <p className="col-span-2 text-xs text-amber-700">
              These disagree — worth reading both reasonings below before trusting either alone.
            </p>
          )}
          {recommendation.technicalReasoning && recommendation.technicalReasoning.length > 0 && (
            <p className="col-span-2 text-xs text-muted-foreground">
              {recommendation.technicalReasoning.join(" ")}
            </p>
          )}
        </div>
      )}

      <p className="text-sm text-muted-foreground">{recommendation.investmentThesis}</p>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Entry Price</p>
          <p className="text-sm font-medium">${recommendation.entryPrice?.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Stop Loss</p>
          <p className="text-sm font-medium">${recommendation.stopLoss?.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Take Profit</p>
          <p className="text-sm font-medium">${recommendation.takeProfit?.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Holding Period</p>
          <p className="text-sm font-medium">{recommendation.holdingPeriod}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>Confidence: {recommendation.confidence}%</span>
        <span>Risk: {recommendation.riskLevel}</span>
      </div>

      {recommendation.supportingReasons?.length > 0 && (
        <ul className="mt-4 list-inside list-disc text-sm text-muted-foreground">
          {recommendation.supportingReasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {showApproveSection && (
        <div className="mt-5 flex items-center gap-3 border-t pt-4">
          {approved ? (
            <p className="text-sm font-medium text-emerald-600">
              Approved — paper trade order placed. Check the Paper Trades page for fills.
            </p>
          ) : !meetsConfidence ? (
            <p className="text-xs text-muted-foreground">
              Confidence ({recommendation.confidence}%) is below the {MIN_APPROVE_CONFIDENCE}% threshold to
              approve — this call isn&apos;t strong enough to trade on.
            </p>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground">Quantity</label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-20"
                />
                <Button onClick={approve} disabled={approving || totalCost === null}>
                  {approving ? "Approving…" : "Approve"}
                </Button>
              </div>
              {totalCost !== null && (
                <p className="text-xs text-muted-foreground">
                  Total to spend: <span className="font-medium text-foreground">${totalCost.toFixed(2)}</span>
                  {" "}({qtyNumber} × ${recommendation.entryPrice?.toFixed(2)})
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
