import { prisma } from "../../lib/prisma";

/**
 * Small illustrative list of US stocks commonly appearing on Islamic index
 * screens (e.g. Dow Jones Islamic Market, S&P Shariah), curated to stay
 * under $120/share. NOT independently verified — compliance depends on
 * debt/interest-income ratios that change over time. Seeded as
 * UNDER_REVIEW; treat as a research shortlist, not a compliance ruling,
 * until backed by a real screening service (e.g. Zoya, Musaffa,
 * IdealRatings).
 *
 * Note: 14 stocks from an earlier version of this list (AAPL, MSFT, NVDA,
 * GOOGL, META, AVGO, ADBE, CRM, COST, PG, JNJ, LLY, HD, TSLA) are no longer
 * listed here since they're all now priced well above $120 — but they
 * remain in the database and are NOT deleted, because they have real
 * AIRecommendation/PaperTrade history attached (Postgres foreign keys
 * block removing them). They're simply skipped by the screener's live
 * price filter now instead of being re-proposed here.
 */
const STARTER_LIST = [
  { symbol: "NKE", company: "Nike Inc", sector: "Consumer Cyclical", industry: "Footwear & Accessories" },
  { symbol: "ON", company: "ON Semiconductor", sector: "Technology", industry: "Semiconductors" },
  { symbol: "HPQ", company: "HP Inc", sector: "Technology", industry: "Computers" },
  { symbol: "HPE", company: "Hewlett Packard Enterprise", sector: "Technology", industry: "Enterprise IT" },
  { symbol: "INTC", company: "Intel Corp", sector: "Technology", industry: "Semiconductors" },
  { symbol: "UBER", company: "Uber Technologies", sector: "Technology", industry: "Technology" },
  { symbol: "GFS", company: "GlobalFoundries", sector: "Technology", industry: "Semiconductor Manufacturing" },
  { symbol: "PINS", company: "Pinterest", sector: "Communication Services", industry: "Internet Services" },

  // Added — confirmed under $120 via live Finnhub check.
  { symbol: "SNAP", company: "Snap Inc", sector: "Communication Services", industry: "Internet Content & Information" },
  { symbol: "PFE", company: "Pfizer Inc", sector: "Healthcare", industry: "Drug Manufacturers" },
  { symbol: "IOT", company: "Samsara Inc", sector: "Technology", industry: "Software" },
  { symbol: "BMY", company: "Bristol-Myers Squibb", sector: "Healthcare", industry: "Drug Manufacturers" },
  { symbol: "ESTC", company: "Elastic NV", sector: "Technology", industry: "Software" },
  { symbol: "CL", company: "Colgate-Palmolive Co", sector: "Consumer Defensive", industry: "Household Products" },
  { symbol: "UPS", company: "United Parcel Service", sector: "Industrials", industry: "Integrated Freight & Logistics" },
  { symbol: "SBUX", company: "Starbucks Corp", sector: "Consumer Cyclical", industry: "Restaurants" },
  { symbol: "KMB", company: "Kimberly-Clark Corp", sector: "Consumer Defensive", industry: "Household Products" },
  { symbol: "NOW", company: "ServiceNow Inc", sector: "Technology", industry: "Software" },
];

async function main() {
  for (const stock of STARTER_LIST) {
    await prisma.shariahStock.upsert({
      where: { symbol: stock.symbol },
      update: {},
      create: {
        symbol: stock.symbol,
        company: stock.company,
        sector: stock.sector,
        industry: stock.industry,
        marketCap: 0,
        shariahStatus: "UNDER_REVIEW",
      },
    });
    console.log(`Seeded ${stock.symbol}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

export {};
