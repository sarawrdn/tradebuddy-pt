import { prisma } from "@/lib/prisma";
import { getOrCreateStock, getShariahUniverse } from "@/lib/shariah";

const TWELVE_DATA_API = "https://api.twelvedata.com";
const HISTORY_DAYS = 45; // MACD needs 35+ data points (26 + 9 for its signal line)

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDailyHistory(symbol: string, retried = false): Promise<Candle[]> {
  const res = await fetch(
    `${TWELVE_DATA_API}/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${HISTORY_DAYS}&apikey=${apiKey()}`
  );

  if (res.status === 429 && !retried) {
    // Free-tier per-minute rate limit — wait out the window once and retry,
    // rather than immediately failing when a scan fires many requests close
    // together.
    await sleep(8_000);
    return fetchDailyHistory(symbol, true);
  }

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

  // Freshness is based on when we last wrote a row (updatedAt, bumped on
  // every upsert whether it inserts or updates), not the trading date of
  // the latest candle — Twelve Data's most recent daily bar lags until
  // market close, so comparing candle date to "today" would never count as
  // fresh and would re-fetch on every single call regardless of how many
  // times we'd already fetched that day.
  const lastFetch = await prisma.priceHistory.findFirst({
    where: { stockId: stock.id },
    orderBy: { updatedAt: "desc" },
  });

  const isFresh = lastFetch && lastFetch.updatedAt >= startOfToday();

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

/**
 * Fetches history for every stock in the universe sequentially, spaced out
 * to stay under Twelve Data's free-tier per-minute rate limit (429s start
 * appearing when a live scan fires 15+ requests at once). Takes ~2-3
 * minutes for a full universe, so it's meant to be run manually/locally
 * (see scripts/warm-price-history) rather than via Vercel Cron — Hobby's
 * 60s function ceiling can't fit it. Once warm, getDailyHistory() calls
 * during the day just read from cache instead of hitting Twelve Data live.
 */
export async function warmPriceHistoryCache() {
  const universe = await getShariahUniverse();
  const results: { symbol: string; ok: boolean; error?: string }[] = [];

  for (const stock of universe) {
    try {
      await getDailyHistory(stock.symbol);
      results.push({ symbol: stock.symbol, ok: true });
    } catch (err) {
      results.push({ symbol: stock.symbol, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    // Twelve Data free tier: 8 requests/minute. ~8s spacing keeps well clear.
    await sleep(8_000);
  }

  return results;
}
