"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Card } from "@/components/ui/card";
import { RecommendationCard, type Recommendation } from "@/components/dashboard/recommendation-card";
import { safeJson } from "@/lib/utils";

interface HistoryItem {
  symbol: string;
  company: string;
  dateGenerated: string;
  recommendation: Recommendation;
}

export interface RecommendationHistoryHandle {
  refresh: () => void;
}

function Section({ title, items }: { title: string; items: HistoryItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      {items.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">No {title.toLowerCase()} recommendations yet.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((item, i) => (
            <RecommendationCard
              key={`${item.recommendation.id}-${i}`}
              symbol={item.symbol}
              company={item.company}
              recommendation={item.recommendation}
              dateGenerated={item.dateGenerated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const RecommendationHistory = forwardRef<RecommendationHistoryHandle>((_, ref) => {
  const [intraday, setIntraday] = useState<HistoryItem[]>([]);
  const [swing, setSwing] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/recommendations");
    const data = await safeJson(res);
    setIntraday(data.intraday ?? []);
    setSwing(data.swing ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useImperativeHandle(ref, () => ({ refresh: load }));

  if (loading) return null;

  return (
    <div className="flex flex-col gap-8">
      <p className="text-xs text-muted-foreground">
        Showing the latest recommendation per stock for each style — older calls stay recorded but are
        superseded once a fresh scan runs.
      </p>
      <Section title="Intraday" items={intraday} />
      <Section title="Swing" items={swing} />
    </div>
  );
});

RecommendationHistory.displayName = "RecommendationHistory";
