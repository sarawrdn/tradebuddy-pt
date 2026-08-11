import { getExtendedHistory } from "@/lib/market-history";
import { getOrCreateStock } from "@/lib/shariah";
import { prisma } from "@/lib/prisma";
import { summarizeTechnicals, deriveTechnicalSignal, calculateTradeLevels, STYLE_BOUNDS } from "@/lib/indicators";
import { optimizeIndividualPlans } from "@/lib/optimize";

// Broad, diversified candidate pool across sectors, deliberately avoiding
// obviously non-Shariah-compliant industries (conventional banks/insurers,
// alcohol, tobacco, gambling) — same starting point used for the manual
// screener earlier. NOT a certified Shariah screen; a real screening
// service should still verify compliance before trusting any of these.
// Extend this list over time as new ideas come up — this is the
// "systematic universe expansion" pool, not a fixed, final set.
export const CANDIDATE_POOL = [
  "GOOGL", "CSCO", "IBM", "PYPL", "SHOP", "NET", "PLTR", "AMD", "QCOM", "MU",
  "WDC", "STX", "JNPR", "ZS", "OKTA", "DOCU", "TWLO", "FTNT", "GEN", "AKAM",
  "VRSN", "EPAM", "GLW", "TER", "ENPH", "FSLR", "SEDG", "MRVL", "LSCC", "SWKS",
  "QRVO", "MCHP", "MRK", "ABBV", "GILD", "BIIB", "BSX", "ZBH", "BAX", "STE",
  "DXCM", "ALGN", "KO", "MDLZ", "HSY", "KHC", "CLX", "CHD", "TGT", "YUM",
  "LULU", "TJX", "ROST", "DG", "DLTR", "MMM", "RTX", "CSX", "GE", "SLB",
  "HAL", "OXY", "DVN", "PSX", "VLO", "T", "VZ", "CMCSA", "TMUS", "NUE",
  "STLD", "AA", "FCX", "DOW", "LYB", "CF", "MOS", "IP", "PKG", "BALL",
  "CCK", "AVY", "SEE", "ALB", "CE", "PPG", "F", "GM", "WBA", "WMB",
  "KMI", "APA", "MRO", "CTRA", "WOLF", "ALGM", "ONTO", "COHR", "LITE", "CIEN",
  "NTAP", "PSTG", "DBX", "BOX", "FIVN", "RNG", "TXN", "ADI", "DELL", "NXPI",
  "NVO", "SNY", "MDT", "PFE", "ABCL", "HP",
];

const MIN_MARKET_CAP_B = 10;
const MIN_AVG_DOLLAR_VOLUME_M = 20;
const MIN_ATR_PCT = 1.0;
const MAX_ATR_PCT = 5.0;
const MIN_RISK_REWARD = 2.0;

export interface CandidateScreenResult {
  symbol: string;
  passedLiveScreen: boolean;
  reason?: string;
}

function apiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY is not set");
  return key;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stage 1 — cheap live screen (market cap, liquidity, volatility band,
 * today's technical signal, reward:risk). Only stocks that pass this get
 * provisionally included in the universe for the more expensive stage 2
 * (full walk-forward validation), so we don't waste grid-search compute on
 * obviously unsuitable candidates.
 */
async function passesLiveScreen(symbol: string): Promise<CandidateScreenResult> {
  const profileRes = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${apiKey()}`);
  const profile = await profileRes.json();
  const marketCapB = typeof profile.marketCapitalization === "number" ? profile.marketCapitalization / 1000 : null;

  if (marketCapB === null || marketCapB < MIN_MARKET_CAP_B) {
    return { symbol, passedLiveScreen: false, reason: `market cap ${marketCapB?.toFixed(1) ?? "n/a"}B < $${MIN_MARKET_CAP_B}B` };
  }

  const candles = await getExtendedHistory(symbol, 60);
  if (candles.length < 35) {
    return { symbol, passedLiveScreen: false, reason: "not enough history" };
  }

  const last20 = candles.slice(-20);
  const avgDollarVolumeM = last20.reduce((sum, c) => sum + (c.volume ?? 0) * c.close, 0) / last20.length / 1_000_000;
  if (avgDollarVolumeM < MIN_AVG_DOLLAR_VOLUME_M) {
    return { symbol, passedLiveScreen: false, reason: `avg dollar volume $${avgDollarVolumeM.toFixed(1)}M < $${MIN_AVG_DOLLAR_VOLUME_M}M` };
  }

  const tech = summarizeTechnicals(candles);
  if (tech.atrPct === null || tech.atrPct < MIN_ATR_PCT || tech.atrPct > MAX_ATR_PCT) {
    return { symbol, passedLiveScreen: false, reason: `ATR ${tech.atrPct?.toFixed(2) ?? "n/a"}% outside ${MIN_ATR_PCT}-${MAX_ATR_PCT}% range` };
  }

  const signalResult = deriveTechnicalSignal(tech);
  if (signalResult.signal !== "BUY") {
    return { symbol, passedLiveScreen: false, reason: `technical signal is ${signalResult.signal}, not BUY` };
  }

  const price = candles[candles.length - 1].close;
  const levels = calculateTradeLevels(price, tech, "SWING", STYLE_BOUNDS.SWING);
  const risk = levels.entryPrice - levels.stopLoss;
  const reward = levels.takeProfit - levels.entryPrice;
  const riskReward = risk > 0 ? reward / risk : 0;
  if (riskReward < MIN_RISK_REWARD) {
    return { symbol, passedLiveScreen: false, reason: `risk:reward ${riskReward.toFixed(1)}:1 < ${MIN_RISK_REWARD}:1` };
  }

  return { symbol, passedLiveScreen: true };
}

export interface DiscoveryResult {
  screened: CandidateScreenResult[];
  provisionallyIncluded: string[];
  addedToUniverse: string[];
  rejectedAfterValidation: string[];
}

/**
 * Two-stage systematic universe expansion: cheap live screen first (stage
 * 1), then only stocks that pass get provisionally added and run through
 * the same full walk-forward validation as the rest of the universe (stage
 * 2, via optimizeIndividualPlans — the same pipeline, no separate logic to
 * drift out of sync). A candidate that fails walk-forward gets excluded
 * again immediately rather than lingering in limbo, keeping the active
 * universe clean instead of slowly accumulating untested names the way it
 * did earlier this session.
 */
export async function discoverAndValidateCandidates(
  candidates: string[] = CANDIDATE_POOL
): Promise<DiscoveryResult> {
  const existing = await prisma.shariahStock.findMany({ select: { symbol: true } });
  const existingSymbols = new Set(existing.map((s) => s.symbol));
  const toScreen = candidates.filter((s) => !existingSymbols.has(s));

  const screened: CandidateScreenResult[] = [];
  for (const symbol of toScreen) {
    try {
      screened.push(await passesLiveScreen(symbol));
    } catch (err) {
      screened.push({ symbol, passedLiveScreen: false, reason: err instanceof Error ? err.message : String(err) });
    }
    // Twelve Data free tier: 8 requests/minute — 8s spacing keeps well
    // clear (each new symbol needs a fresh fetch, same as
    // warmPriceHistoryCache/backtestUniverse).
    await sleep(8_000);
  }

  const provisionallyIncluded = screened.filter((s) => s.passedLiveScreen).map((s) => s.symbol);

  for (const symbol of provisionallyIncluded) {
    const stock = await getOrCreateStock(symbol);
    await prisma.shariahStock.update({ where: { id: stock.id }, data: { shariahStatus: "UNDER_REVIEW" } });
  }

  if (provisionallyIncluded.length === 0) {
    return { screened, provisionallyIncluded, addedToUniverse: [], rejectedAfterValidation: [] };
  }

  // Re-run the standard walk-forward validation pipeline across the now-
  // expanded universe — this also re-validates every already-active stock,
  // which is fine (idempotent) and doubles as the periodic re-check.
  const plans = await optimizeIndividualPlans("SWING", 500, 4);

  const addedToUniverse: string[] = [];
  const rejectedAfterValidation: string[] = [];
  for (const symbol of provisionallyIncluded) {
    const plan = plans.find((p) => p.symbol === symbol);
    if (plan?.trusted) {
      addedToUniverse.push(symbol);
    } else {
      rejectedAfterValidation.push(symbol);
      await prisma.shariahStock.updateMany({ where: { symbol }, data: { shariahStatus: "NON_COMPLIANT" } });
    }
  }

  return { screened, provisionallyIncluded, addedToUniverse, rejectedAfterValidation };
}
