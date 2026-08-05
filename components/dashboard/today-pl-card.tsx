"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface PaperTrade {
  status: string;
  filledExitAt: string | null;
  realizedProfit: string | null;
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function TodayPLCard() {
  const [profit, setProfit] = useState<number | null>(null);
  const [closedCount, setClosedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/paper-trades")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const trades: PaperTrade[] = data.paperTrades ?? [];
        const closedToday = trades.filter(
          (t) => (t.status === "CLOSED_WIN" || t.status === "CLOSED_LOSS") && t.filledExitAt && isToday(t.filledExitAt)
        );
        setProfit(closedToday.reduce((sum, t) => sum + Number(t.realizedProfit ?? 0), 0));
        setClosedCount(closedToday.length);
      })
      .catch(() => {
        if (!cancelled) setProfit(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-muted-foreground">Today&apos;s Paper P/L ({closedCount} closed)</p>
      <p
        className={`text-lg font-semibold ${
          profit === null ? "text-muted-foreground" : profit >= 0 ? "text-emerald-600" : "text-red-500"
        }`}
      >
        {profit === null ? "—" : `${profit >= 0 ? "+" : ""}$${profit.toFixed(2)}`}
      </p>
    </Card>
  );
}
