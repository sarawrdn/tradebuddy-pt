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
