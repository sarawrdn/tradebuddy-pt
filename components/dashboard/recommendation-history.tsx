"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Card } from "@/components/ui/card";
import { RecommendationCard, type Recommendation } from "@/components/dashboard/recommendation-card";
import { cn, safeJson } from "@/lib/utils";

interface HistoryItem {
  symbol: string;
  company: string;
  dateGenerated: string;
  tradingStyle: "INTRADAY" | "SWING";
  recommendation: Recommendation;
}

export interface RecommendationHistoryHandle {
  refresh: () => void;
}

type FilterValue = "ALL" | "INTRADAY" | "SWING";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "INTRADAY", label: "Intraday" },
  { value: "SWING", label: "Swing" },
];

export const RecommendationHistory = forwardRef<RecommendationHistoryHandle>((_, ref) => {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("ALL");

  async function load(style: FilterValue = filter) {
    setLoading(true);
    const query = style === "ALL" ? "" : `?style=${style}`;
    const res = await fetch(`/api/recommendations${query}`);
    const data = await safeJson(res);
    setItems(data.recommendations ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useImperativeHandle(ref, () => ({ refresh: () => load(filter) }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!loading && items.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          {filter === "ALL"
            ? "No recommendations generated yet."
            : `No ${filter.toLowerCase()} recommendations generated yet.`}
        </Card>
      )}

      {items.length > 0 && (
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
});

RecommendationHistory.displayName = "RecommendationHistory";
