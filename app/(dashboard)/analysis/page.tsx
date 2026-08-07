import { getLatestRecommendations, getRecentUpgrades } from "@/lib/recommendations";
import { getSettings } from "@/lib/settings";
import { AnalysisClient } from "@/components/dashboard/analysis-client";

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  const [{ intraday, swing }, upgrades, settings] = await Promise.all([
    getLatestRecommendations(),
    getRecentUpgrades(),
    getSettings(),
  ]);

  return (
    <AnalysisClient
      initialIntraday={intraday}
      initialSwing={swing}
      initialUpgrades={upgrades}
      initialTradingStyle={settings.tradingStyle}
    />
  );
}
