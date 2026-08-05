import { prisma } from "@/lib/prisma";

export async function getOrCreateStock(symbol: string) {
  const existing = await prisma.shariahStock.findUnique({ where: { symbol } });
  if (existing) return existing;

  return prisma.shariahStock.create({
    data: {
      symbol,
      company: symbol,
      sector: "Unknown",
      industry: "Unknown",
      marketCap: 0,
      shariahStatus: "UNDER_REVIEW",
    },
  });
}

export async function getShariahUniverse() {
  // Includes UNDER_REVIEW since no stock has been independently verified yet
  // via a real Shariah screening service — see scripts/import-shariah.
  return prisma.shariahStock.findMany({
    where: { shariahStatus: { in: ["COMPLIANT", "UNDER_REVIEW"] } },
  });
}

export async function refreshShariahStatus(symbol: string) {
  throw new Error(`refreshShariahStatus not implemented for ${symbol}`);
}
