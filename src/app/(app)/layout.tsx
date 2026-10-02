import { requireSession } from "@/lib/auth-helpers";
import { getSettings } from "@/lib/queries";
import { AppShell, type NavItem } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const settings = await getSettings();
  const isOwner = session.user.role === "owner";

  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/bills/new", label: "New bill", icon: "bill" },
    { href: "/lots", label: "Lots", icon: "lots" },
    { href: "/day", label: "Daily summary", icon: "day" },
    { href: "/stock", label: "Stock", icon: "stock" },
    { href: "/ledger", label: "Daily ledger", icon: "ledger" },
    { href: "/expenses", label: "Expenses", icon: "expenses" },
    { href: "/balances", label: "Balances", icon: "balances" },
    ...(isOwner
      ? ([
          { href: "/profit", label: "Profit", icon: "profit" },
          { href: "/settings", label: "Settings", icon: "settings" },
        ] as NavItem[])
      : []),
  ];

  return (
    <AppShell
      firm={settings.firm}
      user={{
        name: session.user.name ?? null,
        email: session.user.email ?? "",
        role: session.user.role,
      }}
      items={items}
    >
      {children}
    </AppShell>
  );
}
