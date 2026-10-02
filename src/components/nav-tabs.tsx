"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  CalendarRange,
  CreditCard,
  LayoutDashboard,
  LineChart,
  Receipt,
  Settings,
  TrendingUp,
  Wallet,
} from "lucide-react";

export type Tab = { href: string; label: string; icon: string };

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  bill: Receipt,
  lots: Boxes,
  day: CalendarRange,
  stock: Wallet,
  ledger: BarChart3,
  expenses: CreditCard,
  balances: LineChart,
  profit: TrendingUp,
  settings: Settings,
};

export function NavTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();

  return (
    <nav className="max-w-6xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto scrollbar-thin">
      {tabs.map((t) => {
        const active =
          pathname === t.href || (t.href !== "/" && pathname.startsWith(t.href));
        const Icon = ICONS[t.icon];
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${
              active
                ? "bg-primary text-primary-foreground font-semibold"
                : "hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
