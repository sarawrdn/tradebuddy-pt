import { prisma } from "../../lib/prisma";

/**
 * Small illustrative starter list of large-cap US stocks commonly appearing
 * on Islamic index screens (e.g. Dow Jones Islamic Market, S&P Shariah).
 * NOT independently verified — compliance depends on debt/interest-income
 * ratios that change over time. Seeded as UNDER_REVIEW; treat as a research
 * shortlist, not a compliance ruling, until backed by a real screening
 * service (e.g. Zoya, Musaffa, IdealRatings).
 */
const STARTER_LIST = [
  { symbol: "AAPL", company: "Apple Inc", sector: "Technology", industry: "Consumer Electronics" },
  { symbol: "MSFT", company: "Microsoft Corp", sector: "Technology", industry: "Software" },
  { symbol: "NVDA", company: "NVIDIA Corp", sector: "Technology", industry: "Semiconductors" },
  { symbol: "GOOGL", company: "Alphabet Inc", sector: "Communication Services", industry: "Internet Content & Information" },
  { symbol: "META", company: "Meta Platforms Inc", sector: "Communication Services", industry: "Internet Content & Information" },
  { symbol: "AVGO", company: "Broadcom Inc", sector: "Technology", industry: "Semiconductors" },
  { symbol: "ADBE", company: "Adobe Inc", sector: "Technology", industry: "Software" },
  { symbol: "CRM", company: "Salesforce Inc", sector: "Technology", industry: "Software" },
  { symbol: "COST", company: "Costco Wholesale Corp", sector: "Consumer Defensive", industry: "Discount Stores" },
  { symbol: "PG", company: "Procter & Gamble Co", sector: "Consumer Defensive", industry: "Household Products" },
  { symbol: "JNJ", company: "Johnson & Johnson", sector: "Healthcare", industry: "Drug Manufacturers" },
  { symbol: "LLY", company: "Eli Lilly and Co", sector: "Healthcare", industry: "Drug Manufacturers" },
  { symbol: "HD", company: "Home Depot Inc", sector: "Consumer Cyclical", industry: "Home Improvement Retail" },
  { symbol: "NKE", company: "Nike Inc", sector: "Consumer Cyclical", industry: "Footwear & Accessories" },
  { symbol: "TSLA", company: "Tesla Inc", sector: "Consumer Cyclical", industry: "Auto Manufacturers" },
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
