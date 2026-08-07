"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { safeJson } from "@/lib/utils";

interface PaperTrade {
  id: string;
  status: string;
  quantity: string;
  entryPrice: string;
  stopLoss: string | null;
  takeProfit: string | null;
  filledEntryPrice: string | null;
  filledExitPrice: string | null;
  exitReason: string | null;
  realizedProfit: string | null;
  stock: { symbol: string };
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700",
  OPEN: "bg-blue-100 text-blue-700",
  CLOSED_WIN: "bg-emerald-100 text-emerald-700",
  CLOSED_LOSS: "bg-red-100 text-red-700",
  CLOSED_MANUAL: "bg-slate-100 text-slate-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

interface SymbolStat {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  totalProfit: number;
  winRate: number;
  avgProfit: number;
}

export function PaperTradesClient({
  initialOrders,
  initialStats,
}: {
  initialOrders: PaperTrade[];
  initialStats: SymbolStat[];
}) {
  const [orders, setOrders] = useState<PaperTrade[]>(initialOrders);
  const [stats, setStats] = useState<SymbolStat[]>(initialStats);

  async function load() {
    const [ordersRes, statsRes] = await Promise.all([
      fetch("/api/paper-trades"),
      fetch("/api/paper-trades/stats"),
    ]);
    const ordersData = await safeJson(ordersRes);
    const statsData = await safeJson(statsRes);
    setOrders(ordersData.paperTrades ?? []);
    setStats(statsData.stats ?? []);
  }

  useEffect(() => {
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  async function cancel(id: string) {
    await fetch(`/api/paper-trades/${id}`, { method: "DELETE" });
    load();
  }

  const closedProfit = orders
    .filter((o) => o.status === "CLOSED_WIN" || o.status === "CLOSED_LOSS")
    .reduce((sum, o) => sum + Number(o.realizedProfit ?? 0), 0);

  const openCount = orders.filter((o) => o.status === "OPEN").length;
  const pendingCount = orders.filter((o) => o.status === "PENDING").length;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Paper Trades</h1>
      <p className="text-sm text-muted-foreground">
        Simulated orders from approved AI recommendations. No real money involved — used to test the bot&apos;s accuracy.
      </p>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="mt-1 text-xl font-semibold">{pendingCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Open</p>
          <p className="mt-1 text-xl font-semibold">{openCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Closed P/L</p>
          <p className={`mt-1 text-xl font-semibold ${closedProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {closedProfit >= 0 ? "+" : ""}${closedProfit.toFixed(2)}
          </p>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Win Rate by Stock</h2>
          <p className="text-xs text-muted-foreground">
            What has actually happened, not a prediction — small sample sizes here aren&apos;t
            statistically meaningful yet.
          </p>
        </div>
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="text-right">Wins</TableHead>
                <TableHead className="text-right">Losses</TableHead>
                <TableHead className="text-right">Win Rate</TableHead>
                <TableHead className="text-right">Avg P/L</TableHead>
                <TableHead className="text-right">Total P/L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No closed trades yet.
                  </TableCell>
                </TableRow>
              )}
              {stats.map((s) => (
                <TableRow key={s.symbol}>
                  <TableCell className="font-medium">{s.symbol}</TableCell>
                  <TableCell className="text-right">{s.trades}</TableCell>
                  <TableCell className="text-right text-emerald-600">{s.wins}</TableCell>
                  <TableCell className="text-right text-red-500">{s.losses}</TableCell>
                  <TableCell className="text-right">{s.winRate.toFixed(0)}%</TableCell>
                  <TableCell className={`text-right ${s.avgProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {s.avgProfit >= 0 ? "+" : ""}${s.avgProfit.toFixed(2)}
                  </TableCell>
                  <TableCell className={`text-right ${s.totalProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {s.totalProfit >= 0 ? "+" : ""}${s.totalProfit.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">Stop Loss</TableHead>
              <TableHead className="text-right">Take Profit</TableHead>
              <TableHead className="text-right">Filled Entry</TableHead>
              <TableHead className="text-right">Exit</TableHead>
              <TableHead className="text-right">P/L</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-sm text-muted-foreground">
                  No paper trades yet — approve a recommendation on the Analysis page.
                </TableCell>
              </TableRow>
            )}
            {orders.map((o) => {
              const pl = o.realizedProfit ? Number(o.realizedProfit) : null;
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.stock.symbol}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_STYLES[o.status]} variant="secondary">
                      {o.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{o.quantity}</TableCell>
                  <TableCell className="text-right">${Number(o.entryPrice).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {o.stopLoss ? `$${Number(o.stopLoss).toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {o.takeProfit ? `$${Number(o.takeProfit).toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {o.filledEntryPrice ? `$${Number(o.filledEntryPrice).toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {o.filledExitPrice ? `$${Number(o.filledExitPrice).toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className={`text-right ${pl === null ? "text-muted-foreground" : pl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {pl === null ? "—" : `${pl >= 0 ? "+" : ""}$${pl.toFixed(2)}`}
                  </TableCell>
                  <TableCell>
                    {o.status === "PENDING" && (
                      <Button variant="ghost" size="sm" onClick={() => cancel(o.id)}>
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
