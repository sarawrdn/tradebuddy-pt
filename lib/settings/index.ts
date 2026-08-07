import { prisma } from "@/lib/prisma";

export async function getSettings() {
  const existing = await prisma.appSettings.findFirst();
  if (existing) return existing;
  return prisma.appSettings.create({ data: {} });
}

export async function setTradingStyle(tradingStyle: "INTRADAY" | "SWING") {
  const settings = await getSettings();
  return prisma.appSettings.update({
    where: { id: settings.id },
    data: { tradingStyle },
  });
}

export async function topUpCash(amount: number) {
  if (amount <= 0) throw new Error("Top-up amount must be positive");
  const settings = await getSettings();
  return prisma.appSettings.update({
    where: { id: settings.id },
    data: { cashBalance: { increment: amount } },
  });
}

export async function adjustCash(amount: number) {
  const settings = await getSettings();
  return prisma.appSettings.update({
    where: { id: settings.id },
    data: { cashBalance: { increment: amount } },
  });
}
