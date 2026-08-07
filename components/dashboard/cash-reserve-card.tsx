"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { safeJson } from "@/lib/utils";

export function CashReserveCard({ initialBalance }: { initialBalance: number }) {
  const [balance, setBalance] = useState(initialBalance);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function topUp() {
    const value = Number(amount);
    if (Number.isNaN(value) || value <= 0) {
      setError("Enter a positive amount");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/cash/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error ?? "Failed to top up");
      setBalance(Number(data.settings.cashBalance));
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to top up");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-muted-foreground">Cash Reserve</p>
      <p className="text-lg font-semibold">${balance.toFixed(2)}</p>
      <div className="mt-2 flex items-center gap-2">
        <Input
          type="number"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && topUp()}
          className="h-8 w-24 text-xs"
        />
        <Button size="sm" onClick={topUp} disabled={saving}>
          {saving ? "Adding…" : "Top Up"}
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </Card>
  );
}
