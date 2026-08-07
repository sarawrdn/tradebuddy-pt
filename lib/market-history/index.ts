import { prisma } from "@/lib/prisma";
import { getOrCreateStock } from "@/lib/shariah";

const TWELVE_DATA_API = "https://api.twelvedata.com";
const HISTORY_DAYS = 30;

export interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

function apiKey(): string {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("TWELVE_DATA_API_KEY is not set");
  return key;
}

async function fetchDailyHistory(symbol: string): Promise<Candle[]> {
  const res = await fetch(
    `${TWELVE_DATA_API}/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${HISTORY_DAYS}&apikey=${apiKey()}`
  );

  if (!res.ok) {
    throw new Error(`Twelve Data request failed for ${symbol}: ${res.status}`);
  }

  const data = await res.json();

  if (data.status === "error" || !Array.isArray(data.values)) {
    throw new Error(`Twelve Data error for ${symbol}: ${data.message ?? "no values returned"}`);
  }

  return data.values.map((v: Record<string, string>) => ({
    date: new Date(v.datetime),
    open: Number(v.open),
    high: Number(v.high),
    low: Number(v.low),
    close: Number(v.close),
    volume: v.volume ? Number(v.volume) : null,
  }));
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns the last ~30 daily candles for a symbol, oldest first. Cached in
 * Postgres and only re-fetched from Twelve Data once per calendar day per
 * symbol, to stay well under the free-tier rate limit.
 */
export async function getDailyHistory(symbol: string): Promise<Candle[]> {
  const stock = await getOrCreateStock(symbol);

  const latestCached = await prisma.priceHistory.findFirst({
    where: { stockId: stock.id },
    orderBy: { date: "desc" },
  });

  const isFresh = latestCached && latestCached.date >= startOfToday();

  if (!isFresh) {
    const candles = await fetchDailyHistory(symbol);

    for (const c of candles) {
      await prisma.priceHistory.upsert({
        where: { stockId_date: { stockId: stock.id, date: c.date } },
        update: { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
        create: {
          stockId: stock.id,
          date: c.date,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        },
      });
    }
  }

  const rows = await prisma.priceHistory.findMany({
    where: { stockId: stock.id },
    orderBy: { date: "asc" },
    take: HISTORY_DAYS,
  });

  return rows.map((r) => ({
    date: r.date,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: r.volume ? Number(r.volume) : null,
  }));
}
