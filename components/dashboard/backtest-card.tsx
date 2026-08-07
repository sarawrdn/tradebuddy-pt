"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { safeJson } from "@/lib/utils";

interface BacktestTrade {
  signalDate: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  filled: boolean;
  filledDate?: string;
  outcome?: "WIN" | "LOSS" | "UNRESOLVED";
  resolvedDate?: string;
  returnPct?: number;
}

interface BacktestResult {
  symbol: string;
  style: "INTRADAY" | "SWING";
  totalSignals: number;
  filled: number;
  notFilled: number;
  wins: number;
  losses: number;
  unresolved: number;
  winRate: number | null;
  avgReturnPct: number | null;
  trades: BacktestTrade[];
}

interface UniverseBacktestSummary {
  totalStocks: number;
  ok: number;
  failed: { symbol: string; error: string }[];
  totalSignals: number;
  totalFilled: number;
  totalWins: number;
  totalLosses: number;
  totalUnresolved: number;
  overallWinRate: number | null;
  overallAvgReturnPct: number | null;
  results: BacktestResult[];
}

export function BacktestCard() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const [universeLoading, setUniverseLoading] = useState(false);
  const [universeError, setUniverseError] = useState<string | null>(null);
  const [universeResult, setUniverseResult] = useState<UniverseBacktestSummary | null>(null);

  async function runUniverseBacktest() {
    setUniverseLoading(true);
    setUniverseError(null);
    setUniverseResult(null);
    try {
      const res = await fetch("/api/backtest/universe?style=SWING");
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error ?? "Universe backtest failed");
      setUniverseResult(data);
    } catch (err) {
      setUniverseError(err instanceof Error ? err.message : "Universe backtest failed");
    } finally {
      setUniverseLoading(false);
    }
  }

  async function runBacktest() {
    const s = symbol.trim().toUpperCase();
    if (!s) return;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/backtest?symbol=${encodeURIComponent(s)}&style=SWING`);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error ?? "Backtest failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backtest failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Backtest</h2>
        <p className="text-sm text-muted-foreground">
          Replays the Data Signal + calculated entry/stop/target rules against a stock&apos;s past
          ~250 trading days — not the AI Signal, since DeepSeek isn&apos;t reproducible enough to
          backtest meaningfully. Shows how the deterministic math alone would have performed.
        </p>
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Backtest entire stock universe</p>
          <p className="text-xs text-muted-foreground">
            Runs every stock sequentially (rate-limit spacing) — may take a few minutes and can be
            cut off by the server timeout if most history isn&apos;t cached yet.
          </p>
        </div>
        <Button onClick={runUniverseBacktest} disabled={universeLoading} variant="secondary">
          {universeLoading ? "Backtesting universe…" : "Backtest All Stocks"}
        </Button>
      </Card>

      {universeError && (
        <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{universeError}</Card>
      )}

      {universeResult && (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold">
              Universe ({universeResult.ok}/{universeResult.totalStocks} stocks)
            </p>
            {universeResult.overallWinRate !== null && (
              <p className="text-sm font-medium">
                Win rate: {universeResult.overallWinRate.toFixed(0)}%
                {universeResult.overallAvgReturnPct !== null && (
                  <span className="ml-2 text-muted-foreground">
                    avg {universeResult.overallAvgReturnPct >= 0 ? "+" : ""}
                    {universeResult.overallAvgReturnPct.toFixed(2)}%
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-center sm:grid-cols-5">
            <Stat label="Signals" value={universeResult.totalSignals} />
            <Stat label="Filled" value={universeResult.totalFilled} />
            <Stat label="Wins" value={universeResult.totalWins} />
            <Stat label="Losses" value={universeResult.totalLosses} />
            <Stat label="Unresolved" value={universeResult.totalUnresolved} />
          </div>

          {universeResult.failed.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Failed: {universeResult.failed.map((f) => f.symbol).join(", ")}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pr-3 py-1">Symbol</th>
                  <th className="pr-3 py-1">Signals</th>
                  <th className="pr-3 py-1">Filled</th>
                  <th className="pr-3 py-1">W/L/U</th>
                  <th className="pr-3 py-1">Win rate</th>
                  <th className="pr-3 py-1">Avg return</th>
                </tr>
              </thead>
              <tbody>
                {[...universeResult.results]
                  .sort((a, b) => (a.avgReturnPct ?? 0) - (b.avgReturnPct ?? 0))
                  .map((r) => (
                    <tr key={r.symbol} className="border-t">
                      <td className="pr-3 py-1 font-medium">{r.symbol}</td>
                      <td className="pr-3 py-1">{r.totalSignals}</td>
                      <td className="pr-3 py-1">{r.filled}</td>
                      <td className="pr-3 py-1">
                        {r.wins}/{r.losses}/{r.unresolved}
                      </td>
                      <td className="pr-3 py-1">{r.winRate !== null ? `${r.winRate.toFixed(0)}%` : "—"}</td>
                      <td className="pr-3 py-1">
                        {r.avgReturnPct !== null
                          ? `${r.avgReturnPct >= 0 ? "+" : ""}${r.avgReturnPct.toFixed(2)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-3 p-4 sm:flex-row">
        <Input
          placeholder="Enter a symbol, e.g. NOW"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runBacktest()}
          className="sm:max-w-xs"
        />
        <Button onClick={runBacktest} disabled={loading || !symbol.trim()}>
          {loading ? "Running…" : "Run Backtest"}
        </Button>
      </Card>

      {error && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</Card>}

      {result && (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold">
              {result.symbol} <span className="text-sm font-normal text-muted-foreground">({result.style})</span>
            </p>
            {result.winRate !== null && (
              <p className="text-sm font-medium">
                Win rate: {result.winRate.toFixed(0)}%
                {result.avgReturnPct !== null && (
                  <span className="ml-2 text-muted-foreground">
                    avg {result.avgReturnPct >= 0 ? "+" : ""}
                    {result.avgReturnPct.toFixed(2)}%
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
            <Stat label="Signals" value={result.totalSignals} />
            <Stat label="Filled" value={result.filled} />
            <Stat label="Not filled" value={result.notFilled} />
            <Stat label="Wins" value={result.wins} />
            <Stat label="Losses" value={result.losses} />
            <Stat label="Unresolved" value={result.unresolved} />
          </div>

          {result.trades.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No BUY signals fired for this stock over the backtested window.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pr-3 py-1">Signal date</th>
                    <th className="pr-3 py-1">Entry</th>
                    <th className="pr-3 py-1">Stop</th>
                    <th className="pr-3 py-1">Target</th>
                    <th className="pr-3 py-1">Filled</th>
                    <th className="pr-3 py-1">Outcome</th>
                    <th className="pr-3 py-1">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} className="border-t">
                      <td className="pr-3 py-1">{t.signalDate}</td>
                      <td className="pr-3 py-1">${t.entryPrice.toFixed(2)}</td>
                      <td className="pr-3 py-1">${t.stopLoss.toFixed(2)}</td>
                      <td className="pr-3 py-1">${t.takeProfit.toFixed(2)}</td>
                      <td className="pr-3 py-1">{t.filled ? t.filledDate : "no"}</td>
                      <td className="pr-3 py-1">{t.filled ? t.outcome : "—"}</td>
                      <td className="pr-3 py-1">
                        {t.returnPct !== undefined
                          ? `${t.returnPct >= 0 ? "+" : ""}${t.returnPct.toFixed(2)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
