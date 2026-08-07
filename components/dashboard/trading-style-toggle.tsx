"use client";

import { Card } from "@/components/ui/card";

// Intraday is hidden for now (per user request) — focus is on swing.
// The underlying setting/schema still supports INTRADAY; this is just a
// UI simplification, not a removal, and easy to bring back later.
type TradingStyle = "INTRADAY" | "SWING";

export function TradingStyleToggle({ initialStyle }: { initialStyle: TradingStyle }) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <span className="text-xs text-muted-foreground">Trading style:</span>
      <span className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background">Swing</span>
      <span className="text-xs text-muted-foreground">1-3 month holds</span>
      {initialStyle === "INTRADAY" && (
        <span className="text-xs text-amber-700">(setting still shows INTRADAY — will sync next visit)</span>
      )}
    </Card>
  );
}
