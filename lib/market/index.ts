const FINNHUB_API = "https://finnhub.io/api/v1";

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  asOf: Date;
}

function apiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY is not set");
  return key;
}

export async function getQuote(symbol: string): Promise<Quote> {
  const res = await fetch(
    `${FINNHUB_API}/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey()}`,
    { next: { revalidate: 30 } }
  );

  if (!res.ok) {
    throw new Error(`Finnhub quote request failed for ${symbol}: ${res.status}`);
  }

  const data = await res.json();

  if (data.c === 0 && data.pc === 0) {
    throw new Error(`No quote data returned for ${symbol}`);
  }

  return {
    symbol,
    price: data.c,
    change: data.d,
    changePercent: data.dp,
    high: data.h,
    low: data.l,
    open: data.o,
    previousClose: data.pc,
    asOf: new Date(data.t * 1000),
  };
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  return Promise.all(symbols.map(getQuote));
}

export interface NewsItem {
  headline: string;
  summary: string;
  source: string;
  datetime: Date;
  url: string;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Recent company news headlines — extra context for the AI Signal only.
 * Never touches entry/stop/take-profit, which stay purely math-derived; this
 * is the one place the system sees anything beyond price/volume (no
 * fundamentals or earnings data otherwise). Best-effort: a failure here
 * shouldn't block a recommendation, same as a missing price-history fetch.
 */
export async function getCompanyNews(symbol: string, daysBack = 7, limit = 5): Promise<NewsItem[]> {
  const to = new Date();
  const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);

  const res = await fetch(
    `${FINNHUB_API}/company-news?symbol=${encodeURIComponent(symbol)}&from=${formatDate(from)}&to=${formatDate(to)}&token=${apiKey()}`
  );

  if (!res.ok) {
    throw new Error(`Finnhub news request failed for ${symbol}: ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, limit)
    .map((item) => ({
      headline: item.headline,
      summary: item.summary,
      source: item.source,
      datetime: new Date(item.datetime * 1000),
      url: item.url,
    }));
}
