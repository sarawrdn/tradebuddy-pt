"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RecommendationCard, type Recommendation } from "@/components/dashboard/recommendation-card";
import {
  RecommendationHistory,
  type RecommendationHistoryHandle,
} from "@/components/dashboard/recommendation-history";
import { UpgradeAlertBanner } from "@/components/dashboard/upgrade-alert-banner";
import { TradingStyleToggle } from "@/components/dashboard/trading-style-toggle";
import { safeJson } from "@/lib/utils";

interface ScanResult {
  symbol: string;
  company: string;
  shariahStatus: string;
  recommendation: Recommendation;
}

interface HistoryItem {
  symbol: string;
  company: string;
  dateGenerated: string;
  recommendation: Recommendation;
}

interface Upgrade {
  symbol: string;
  company: string;
  upgradedAt: string;
}

export function AnalysisClient({
  initialIntraday,
  initialSwing,
  initialUpgrades,
  initialTradingStyle,
}: {
  initialIntraday: HistoryItem[];
  initialSwing: HistoryItem[];
  initialUpgrades: Upgrade[];
  initialTradingStyle: "INTRADAY" | "SWING";
}) {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ symbol: string; recommendation: Recommendation } | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<ScanResult[] | null>(null);
  const [skippedAboveMaxPrice, setSkippedAboveMaxPrice] = useState(0);

  const historyRef = useRef<RecommendationHistoryHandle>(null);

  async function getRecommendation() {
    const s = symbol.trim().toUpperCase();
    if (!s) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/recommend?symbol=${encodeURIComponent(s)}`);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error ?? "Failed to generate recommendation");
      setResult(data);
      historyRef.current?.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate recommendation");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function scanUniverse() {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/screen");
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error ?? "Failed to scan stock universe");
      setScanned(data.scanned ?? []);
      setSkippedAboveMaxPrice(data.skippedAboveMaxPrice ?? 0);
      historyRef.current?.refresh();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Failed to scan stock universe");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <UpgradeAlertBanner upgrades={initialUpgrades} />

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">AI Analysis</h1>
          <TradingStyleToggle initialStyle={initialTradingStyle} />
        </div>

        <Card className="flex flex-row gap-3 p-4">
          <Input
            placeholder="Enter a symbol, e.g. AAPL"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && getRecommendation()}
            className="max-w-xs"
          />
          <Button onClick={getRecommendation} disabled={loading || !symbol.trim()}>
            {loading ? "Analyzing…" : "Get Recommendation"}
          </Button>
        </Card>

        {error && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</Card>}

        {result && (
          <RecommendationCard symbol={result.symbol} recommendation={result.recommendation} />
        )}
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Screen Stock Universe</h2>
            <p className="text-sm text-muted-foreground">
              Scans your Shariah stock list for candidates under $120 and ranks the results.
            </p>
          </div>
          <Button onClick={scanUniverse} disabled={scanning}>
            {scanning ? "Scanning…" : "Scan Universe"}
          </Button>
        </div>

        <Card className="border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Shariah status shown here is not independently verified — treat it as a research
          shortlist, not a compliance ruling, until backed by a real screening service.
        </Card>

        {scanned && skippedAboveMaxPrice > 0 && (
          <p className="text-xs text-muted-foreground">
            Skipped {skippedAboveMaxPrice} stock{skippedAboveMaxPrice === 1 ? "" : "s"} currently priced at
            $120 or above.
          </p>
        )}

        {scanError && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{scanError}</Card>}

        {scanned && scanned.length === 0 && (
          <Card className="p-4 text-sm text-muted-foreground">
            No stocks in your universe yet. Run <code>npm run seed:shariah</code> to seed a starter list.
          </Card>
        )}

        {scanned && scanned.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {scanned.map((s) => (
              <div key={s.symbol} className="flex flex-col gap-2">
                <Badge variant="outline" className="w-fit text-xs text-muted-foreground">
                  Shariah: {s.shariahStatus.replace("_", " ")}
                </Badge>
                <RecommendationCard symbol={s.symbol} company={s.company} recommendation={s.recommendation} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold">Recommendation History</h2>
        <RecommendationHistory ref={historyRef} initialIntraday={initialIntraday} initialSwing={initialSwing} />
      </div>
    </div>
  );
}
