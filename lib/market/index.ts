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
