import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TodayPLCard } from "@/components/dashboard/today-pl-card";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">TradeBuddy</h1>
        <TodayPLCard />
      </div>

      <Card className="flex flex-col items-start gap-4 p-6">
        <div>
          <p className="text-lg font-semibold">Get an AI recommendation</p>
          <p className="text-sm text-muted-foreground">
            Look up a symbol or scan your Shariah stock universe for BUY candidates, then approve
            one to start tracking it as a paper trade.
          </p>
        </div>
        <Button asChild>
          <Link href="/analysis">Go to Analysis</Link>
        </Button>
      </Card>

      <Card className="flex flex-col items-start gap-4 p-6">
        <div>
          <p className="text-lg font-semibold">Track paper trades</p>
          <p className="text-sm text-muted-foreground">
            See pending, open, and closed simulated trades with realized profit and loss.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/paper-trades">Go to Paper Trades</Link>
        </Button>
      </Card>
    </div>
  );
}
