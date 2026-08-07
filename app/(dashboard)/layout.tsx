import Link from "next/link";
import { Home, LineChart, FlaskConical, Zap } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PaperTradeHeartbeat } from "@/components/dashboard/paper-trade-heartbeat";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { MobileNav } from "@/components/dashboard/mobile-nav";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/analysis", label: "Analysis", icon: LineChart },
  { href: "/paper-trades", label: "Paper Trades", icon: FlaskConical },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-muted/40">
      <PaperTradeHeartbeat />
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-background p-5 md:flex">
        <div className="mb-8 flex items-center gap-2 px-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
            <Zap className="h-4 w-4 fill-current" />
          </span>
          <span className="text-lg font-semibold">TradeBuddy</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b bg-background px-4 py-4 md:justify-end md:px-6">
          <Link href="/" className="flex items-center gap-2 md:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background">
              <Zap className="h-3.5 w-3.5 fill-current" />
            </span>
            <span className="text-base font-semibold">TradeBuddy</span>
          </Link>
          <div className="flex items-center gap-4">
            <SignOutButton />
            <Avatar className="h-8 w-8">
              <AvatarFallback>SW</AvatarFallback>
            </Avatar>
          </div>
        </header>

        <main className="flex-1 p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>

      <MobileNav />
    </div>
  );
}
