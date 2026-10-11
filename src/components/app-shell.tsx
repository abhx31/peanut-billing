"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  CalendarRange,
  CreditCard,
  FileText,
  HandCoins,
  LayoutDashboard,
  LineChart,
  Menu,
  Nut,
  Package,
  Receipt,
  Scale,
  Settings as SettingsIcon,
  ShoppingBasket,
  Store,
  TrendingUp,
  Users as UsersIcon,
  Wallet,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { LocBar } from "@/components/loc-bar";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { Loc } from "@/lib/loc";

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  ownerOnly?: boolean;
};

const ICONS = {
  dashboard: LayoutDashboard,
  bill: Receipt,
  lots: Boxes,
  day: CalendarRange,
  stock: Package,
  nm: Store,
  ledger: BarChart3,
  expenses: CreditCard,
  hamali: Scale,
  cj: HandCoins,
  recv: Wallet,
  balances: LineChart,
  gst: FileText,
  gcust: UsersIcon,
  patti: ShoppingBasket,
  profit: TrendingUp,
  settings: SettingsIcon,
};

type Props = {
  firm: string;
  user: { name: string | null; email: string; role: "owner" | "editor" | "staff" };
  loc: Loc;
  items: NavItem[];
  children: React.ReactNode;
};

export function AppShell({ firm, user, loc, items, children }: Props) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();
  const closeMobile = React.useCallback(() => setMobileOpen(false), []);

  const activeItem = items.find(
    (i) => pathname === i.href || (i.href !== "/" && pathname.startsWith(i.href)),
  );

  return (
    <div className="min-h-screen flex bg-muted/30">
      <Sidebar firm={firm} items={items} />

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-background border-r shadow-xl md:hidden transform transition-transform",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <Brand firm={firm} />
          <Button
            variant="ghost"
            size="icon"
            onClick={closeMobile}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <SidebarNav items={items} onNavigate={closeMobile} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 md:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold truncate">
                {activeItem?.label ?? "Dashboard"}
              </h1>
              <p className="text-xs text-muted-foreground truncate">{firm}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} role={user.role} />
          </div>
        </header>

        <LocBar loc={loc} />

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>

        <footer className="border-t py-3 px-4 text-xs text-muted-foreground text-center">
          {firm} · Peanut Billing · FY 1 Apr – 31 Mar
        </footer>
      </div>
    </div>
  );
}

function Sidebar({ firm, items }: { firm: string; items: NavItem[] }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden md:flex md:w-64 flex-col border-r bg-background">
      <div className="h-16 flex items-center px-5 border-b">
        <Brand firm={firm} />
      </div>
      <SidebarNav items={items} />
    </aside>
  );
}

function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active =
          pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ firm }: { firm: string }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Nut className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{firm}</div>
        <div className="text-[11px] text-muted-foreground truncate">Peanut Billing</div>
      </div>
    </Link>
  );
}
