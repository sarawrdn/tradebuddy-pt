"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TradingStyle = "INTRADAY" | "SWING";

const OPTIONS: { value: TradingStyle; label: string; hint: string }[] = [
  { value: "INTRADAY", label: "Intraday", hint: "same-day entries/exits" },
  { value: "SWING", label: "Swing", hint: "1-3 month holds" },
];

export function TradingStyleToggle() {
  const [style, setStyle] = useState<TradingStyle | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => setStyle(data.settings?.tradingStyle ?? "INTRADAY"))
      .catch(() => setStyle("INTRADAY"));
  }, []);

  async function update(value: TradingStyle) {
    setStyle(value);
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradingStyle: value }),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex items-center gap-3 p-3">
      <span className="text-xs text-muted-foreground">Trading style:</span>
      <div className="flex gap-1">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => update(opt.value)}
            disabled={saving || style === null}
            title={opt.hint}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              style === opt.value
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {style && (
        <span className="text-xs text-muted-foreground">
          {OPTIONS.find((o) => o.value === style)?.hint}
        </span>
      )}
    </Card>
  );
}
