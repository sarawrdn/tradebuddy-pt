"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Card } from "@/components/ui/card";
import { RecommendationCard, type Recommendation } from "@/components/dashboard/recommendation-card";

interface HistoryItem {
  symbol: string;
  company: string;
  dateGenerated: string;
  recommendation: Recommendation;
}

export interface RecommendationHistoryHandle {
  refresh: () => void;
}

export const RecommendationHistory = forwardRef<RecommendationHistoryHandle>((_, ref) => {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/recommendations");
    const data = await res.json();
    setItems(data.recommendations ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useImperativeHandle(ref, () => ({ refresh: load }));

  if (!loading && items.length === 0) {
    return <Card className="p-4 text-sm text-muted-foreground">No recommendations generated yet.</Card>;
  }

  return (
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
  );
});

RecommendationHistory.displayName = "RecommendationHistory";
