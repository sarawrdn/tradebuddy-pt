"use client";

import { useEffect, useState } from "react";
import { TrendingUp, X } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Upgrade {
  symbol: string;
  company: string;
  upgradedAt: string;
}

export function UpgradeAlertBanner() {
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/recommendations/upgrades")
      .then((res) => res.json())
      .then((data) => setUpgrades(data.upgrades ?? []))
      .catch(() => {});
  }, []);

  if (dismissed || upgrades.length === 0) return null;

  return (
    <Card className="flex items-start gap-3 border-emerald-200 bg-emerald-50 p-4">
      <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
      <div className="flex-1">
        <p className="text-sm font-medium text-emerald-800">
          {upgrades.length === 1
            ? `${upgrades[0].symbol} upgraded from WATCH to BUY`
            : `${upgrades.length} stocks upgraded from WATCH to BUY`}
        </p>
        <p className="mt-1 text-sm text-emerald-700">
          {upgrades.map((u) => u.symbol).join(", ")} — see Recommendation History below for details.
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-emerald-600 hover:text-emerald-800"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </Card>
  );
}
