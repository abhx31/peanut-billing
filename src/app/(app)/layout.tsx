import { requireSession } from "@/lib/auth-helpers";
import { getSettings } from "@/lib/queries";
import { getCurrentLoc } from "@/lib/loc";
import { AppShell, type NavItem } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [settings, loc] = await Promise.all([getSettings(), getCurrentLoc()]);
  const role = session.user.role;
  const isPrivileged = role === "owner" || role === "editor";
  const isOwner = role === "owner";

  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/bills/new", label: "New bill", icon: "bill" },
    { href: "/lots", label: "Add lots", icon: "lots" },
    { href: "/day", label: "Daily summary", icon: "day" },
    { href: "/stock", label: "Stock", icon: "stock" },
    { href: "/nm", label: "Bag transfers", icon: "nm" },
    { href: "/ledger", label: "Daily ledger", icon: "ledger" },
    { href: "/expenses", label: "Expenses", icon: "expenses" },
    { href: "/hamali", label: "Hamali", icon: "hamali" },
    { href: "/cj", label: "CJ", icon: "cj" },
    { href: "/recv", label: "Receivables", icon: "recv" },
    { href: "/balances", label: "Balances", icon: "balances" },
    { href: "/gst", label: "GST bill", icon: "gst" },
    { href: "/gcust", label: "GST customers", icon: "gcust" },
    ...(isPrivileged
      ? ([
          { href: "/gstp", label: "GST purchase", icon: "gst" },
          { href: "/patti", label: "Patti bill", icon: "patti" },
          { href: "/patti-payments", label: "Payments recorded", icon: "pattiPayments" },
          { href: "/cash-deposits", label: "Cash deposits", icon: "cashDeposits" },
          { href: "/profit", label: "Profit", icon: "profit" },
        ] as NavItem[])
      : []),
    ...(isOwner
      ? ([{ href: "/settings", label: "Settings", icon: "settings" }] as NavItem[])
      : []),
  ];

  return (
    <AppShell
      firm={settings.firm}
      user={{
        name: session.user.name ?? null,
        email: session.user.email ?? "",
        role,
      }}
      loc={loc}
      items={items}
    >
      {children}
    </AppShell>
  );
}
