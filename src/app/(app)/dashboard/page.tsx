import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  CreditCard,
  HandCoins,
  Package,
  Receipt,
  ShoppingBasket,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import {
  cashBalanceBefore,
  getAllPaymentsOnDate,
  getBillsByDate,
  getCustomerBalances,
  getLatestBills,
  getLotsWithStock,
  getSalesSeries,
} from "@/lib/queries";
import { getCjTotals } from "@/lib/queries-cj";
import { getOldDuesSummary } from "@/lib/queries-recv";
import { db, schema } from "@/db";
import { getCurrentLoc, locLabel } from "@/lib/loc";
import { money, pad2, today } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SalesChart } from "@/components/sales-chart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession();
  const role = session.user.role;
  const isPrivileged = role === "owner" || role === "editor";
  const isOwner = role === "owner";
  const date = today();
  const loc = await getCurrentLoc();
  const storeName = locLabel(loc);
  // Use a sentinel that's clearly past any real business date to get the all-time position.
  const futureAnchor = "9999-12-31";

  const [
    bills,
    paysToday,
    lots,
    balances,
    cashBal,
    upiBal,
    latestAll,
    series,
    cj,
    dues,
    pattiUnpaidRow,
  ] = await Promise.all([
    getBillsByDate(date, isOwner),
    getAllPaymentsOnDate(date),
    getLotsWithStock(),
    getCustomerBalances(),
    cashBalanceBefore("Cash", futureAnchor),
    cashBalanceBefore("UPI", futureAnchor),
    getLatestBills(24, isOwner),
    getSalesSeries(14, loc),
    getCjTotals(),
    getOldDuesSummary(),
    isPrivileged
      ? db
          .select({ s: sql<string>`coalesce(sum(${schema.pattiBills.net}), 0)` })
          .from(schema.pattiBills)
          .where(sql`${schema.pattiBills.paidMode} IS NULL OR ${schema.pattiBills.paidMode} = ''`)
          .then((r) => r[0])
      : Promise.resolve(undefined),
  ]);
  const latest = latestAll.filter((b) => b.loc === loc).slice(0, 8);
  const billsHere = bills.filter((b) => b.loc === loc);

  function statsFor(loc: "" | "NM") {
    const bs = bills.filter((b) => b.loc === loc);
    const ps = paysToday.filter((p) => (p.billLoc ?? "") === loc);
    const sumPay = (m: "Cash" | "UPI" | "CJ") =>
      ps.filter((p) => p.mode === m).reduce((s, p) => s + Number(p.amount), 0);
    return {
      bills: bs.length,
      bags: bs.reduce((s, b) => s + b.bags, 0),
      sales: bs.reduce((s, b) => s + b.total, 0),
      cashIn: sumPay("Cash"),
      upiIn: sumPay("UPI"),
      cjIn: sumPay("CJ"),
      creditGiven: bs.reduce((s, b) => s + b.balance, 0),
      profit: isOwner ? bs.reduce((s, b) => s + (b.profit ?? 0), 0) : 0,
    };
  }
  const storeRows: { name: string; stats: ReturnType<typeof statsFor> }[] = [
    { name: "Main store", stats: statsFor("") },
    { name: "New Mahavir", stats: statsFor("NM") },
  ];
  const storeTotals = {
    bills: storeRows.reduce((s, r) => s + r.stats.bills, 0),
    bags: storeRows.reduce((s, r) => s + r.stats.bags, 0),
    sales: storeRows.reduce((s, r) => s + r.stats.sales, 0),
    cashIn: storeRows.reduce((s, r) => s + r.stats.cashIn, 0),
    upiIn: storeRows.reduce((s, r) => s + r.stats.upiIn, 0),
    cjIn: storeRows.reduce((s, r) => s + r.stats.cjIn, 0),
    creditGiven: storeRows.reduce((s, r) => s + r.stats.creditGiven, 0),
    profit: storeRows.reduce((s, r) => s + r.stats.profit, 0),
  };

  const pattiUnpaid = Number(pattiUnpaidRow?.s ?? 0);
  const salesToday = billsHere.reduce((s, b) => s + b.total, 0);
  const salesYesterday = series[series.length - 2]?.total ?? 0;
  const salesDelta =
    salesYesterday > 0
      ? ((salesToday - salesYesterday) / salesYesterday) * 100
      : salesToday > 0
        ? 100
        : 0;

  const pendingCredit =
    balances.reduce((s, c) => s + c.balance, 0) + dues.outstanding;
  const dueCount = balances.filter((c) => c.balance > 0.5).length;
  const totalBagsLeft = lots.reduce((s, l) => s + l.left, 0);
  const stockM = lots.reduce((s, l) => s + l.stkM, 0);
  const stockN = lots.reduce((s, l) => s + l.stkN, 0);
  const lowStockLots = lots.filter((l) => l.left > 0 && l.left <= 5).length;
  const outOfStock = lots.filter((l) => l.left <= 0).length;
  const salesLast14 = series.reduce((s, d) => s + d.total, 0);

  return (
    <div className="space-y-8">
      <section className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Hello{session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            <span className="mx-2">·</span>
            Viewing <b>{storeName}</b>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/bills/new">
            <Button className="shadow-sm">
              <Receipt className="mr-2 h-4 w-4" />
              New bill
            </Button>
          </Link>
          <Link href="/lots">
            <Button variant="outline">
              <Boxes className="mr-2 h-4 w-4" />
              Add lot
            </Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          title={`Sales today · ${storeName}`}
          value={money(salesToday)}
          sub={`${billsHere.length} bill${billsHere.length === 1 ? "" : "s"}`}
          icon={Receipt}
          delta={salesDelta}
          href="/day"
        />
        <KPICard
          title="Cash in hand"
          value={money(cashBal)}
          sub="Book balance"
          icon={Banknote}
          href="/ledger"
        />
        <KPICard
          title="Bank / UPI"
          value={money(upiBal)}
          sub="Book balance"
          icon={Wallet}
          href="/ledger"
        />
        <KPICard
          title="Owed by customers"
          value={money(pendingCredit)}
          sub={`${dueCount} with pending bills${dues.outstanding > 0.5 ? ` · incl ${money(dues.outstanding)} old` : ""}`}
          icon={CreditCard}
          tone={pendingCredit > 0.5 ? "warn" : undefined}
          href="/balances"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          title="With CJ (to collect)"
          value={money(cj.outstanding)}
          sub={`Received today: ${money(cj.receivedToday)}`}
          icon={HandCoins}
          tone={cj.outstanding > 0.5 ? "warn" : undefined}
          href="/cj"
        />
        <KPICard
          title="Main store"
          value={`${stockM} bags`}
          sub={`${lots.length} lot${lots.length === 1 ? "" : "s"}`}
          icon={Store}
          href="/stock"
        />
        <KPICard
          title="New Mahavir"
          value={`${stockN} bags`}
          sub="Branch stock"
          icon={Store}
          href="/nm"
        />
        {isPrivileged && (
          <KPICard
            title="Patti not yet paid"
            value={money(pattiUnpaid)}
            sub="Purchases pending payment"
            icon={ShoppingBasket}
            tone={pattiUnpaid > 0.5 ? "warn" : undefined}
            href="/patti"
          />
        )}
        {!isPrivileged && (
          <KPICard
            title="Total stock"
            value={`${totalBagsLeft} bags`}
            sub={`${outOfStock + lowStockLots} low / out`}
            icon={Boxes}
            tone={outOfStock > 0 || lowStockLots > 0 ? "warn" : undefined}
            href="/stock"
          />
        )}
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" />
            Today by store
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4">Store</th>
                  <th className="py-2 pr-4 text-right">Bills</th>
                  <th className="py-2 pr-4 text-right">Bags</th>
                  <th className="py-2 pr-4 text-right">Sales</th>
                  <th className="py-2 pr-4 text-right">Cash in</th>
                  <th className="py-2 pr-4 text-right">UPI in</th>
                  <th className="py-2 pr-4 text-right">CJ in</th>
                  <th className="py-2 pr-4 text-right">Credit given</th>
                  {isOwner && <th className="py-2 pr-4 text-right">Profit</th>}
                </tr>
              </thead>
              <tbody>
                {storeRows.map((r) => {
                  const isCurrent = r.name === storeName;
                  return (
                  <tr
                    key={r.name}
                    className={`border-b ${isCurrent ? "bg-primary/5" : ""}`}
                  >
                    <td className="py-2 pr-4 font-medium">
                      {r.name}
                      {isCurrent && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          Working here
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right">{r.stats.bills}</td>
                    <td className="py-2 pr-4 text-right">{r.stats.bags}</td>
                    <td className="py-2 pr-4 text-right">{money(r.stats.sales)}</td>
                    <td className="py-2 pr-4 text-right">{money(r.stats.cashIn)}</td>
                    <td className="py-2 pr-4 text-right">{money(r.stats.upiIn)}</td>
                    <td className="py-2 pr-4 text-right">{money(r.stats.cjIn)}</td>
                    <td className="py-2 pr-4 text-right">
                      {money(r.stats.creditGiven)}
                    </td>
                    {isOwner && (
                      <td className="py-2 pr-4 text-right">{money(r.stats.profit)}</td>
                    )}
                  </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td className="py-2 pr-4">Total</td>
                  <td className="py-2 pr-4 text-right">{storeTotals.bills}</td>
                  <td className="py-2 pr-4 text-right">{storeTotals.bags}</td>
                  <td className="py-2 pr-4 text-right">{money(storeTotals.sales)}</td>
                  <td className="py-2 pr-4 text-right">{money(storeTotals.cashIn)}</td>
                  <td className="py-2 pr-4 text-right">{money(storeTotals.upiIn)}</td>
                  <td className="py-2 pr-4 text-right">{money(storeTotals.cjIn)}</td>
                  <td className="py-2 pr-4 text-right">
                    {money(storeTotals.creditGiven)}
                  </td>
                  {isOwner && (
                    <td className="py-2 pr-4 text-right">{money(storeTotals.profit)}</td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-2 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Sales — last 14 days · {storeName}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Total: {money(salesLast14)}
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {series.filter((s) => s.total > 0).length} active days
            </Badge>
          </CardHeader>
          <CardContent className="pb-6">
            <SalesChart data={series} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-primary" />
              Stock snapshot
            </CardTitle>
            <Link
              href="/stock"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              All stock →
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <StockStat label="Lots" value={lots.length} />
              <StockStat label="Bags left" value={totalBagsLeft} />
              <StockStat
                label="Low / out"
                value={lowStockLots + outOfStock}
                tone={outOfStock > 0 || lowStockLots > 0 ? "warn" : undefined}
              />
            </div>
            <div className="divide-y">
              {lots.length === 0 ? (
                <EmptyState
                  title="No lots yet"
                  description="Add a lot to track stock."
                  cta={
                    <Link href="/lots">
                      <Button size="sm">Add lot</Button>
                    </Link>
                  }
                />
              ) : (
                lots.slice(0, 5).map((l) => (
                  <div
                    key={l.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          l.left <= 0
                            ? "bg-destructive"
                            : l.left <= 5
                              ? "bg-warning"
                              : "bg-success"
                        }`}
                      />
                      <span className="text-sm truncate">{l.name}</span>
                    </div>
                    <span
                      className={`text-sm font-mono font-semibold tabular-nums ${
                        l.left <= 0
                          ? "text-destructive"
                          : l.left <= 5
                            ? "text-warning"
                            : ""
                      }`}
                    >
                      {l.left}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Latest bills · {storeName}
          </CardTitle>
          <Link
            href="/day"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View today →
          </Link>
        </CardHeader>
        <CardContent>
          {latest.length === 0 ? (
            <EmptyState
              title="No bills yet"
              description="Your first bill will show up here."
              cta={
                <Link href="/bills/new">
                  <Button size="sm">
                    Create bill <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y">
              {latest.map((b) => (
                <div
                  key={b.id}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <span className="font-mono text-xs font-semibold">
                        #{pad2(b.no)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{b.customer}</span>
                        <PaymentBadge balance={b.balance} total={b.total} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {b.date} · {b.lotSummary} · {b.bags} bags · {b.kg} kg
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold tabular-nums">{money(b.total)}</div>
                    {isOwner && b.profit !== null && (
                      <div
                        className={`text-xs tabular-nums ${b.profit < 0 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {money(b.profit)} profit
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {outOfStock + lowStockLots > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning">
              <Package className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Low stock warning</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {outOfStock > 0 && `${outOfStock} lot${outOfStock === 1 ? "" : "s"} out of stock. `}
                {lowStockLots > 0 && `${lowStockLots} lot${lowStockLots === 1 ? "" : "s"} with ≤5 bags left.`}
              </div>
            </div>
            <Link href="/stock">
              <Button variant="outline" size="sm">
                Review stock
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type KPIProps = {
  title: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  tone?: "warn";
  delta?: number;
};

function KPICard({ title, value, sub, icon: Icon, href, tone, delta }: KPIProps) {
  const content = (
    <Card
      className={`h-full transition-all hover:shadow-md hover:-translate-y-0.5 ${href ? "cursor-pointer" : ""}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              {title}
            </div>
            <div
              className={`mt-1.5 text-2xl font-bold tabular-nums tracking-tight ${tone === "warn" ? "text-destructive" : ""}`}
            >
              {value}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              {sub && <span>{sub}</span>}
              {delta !== undefined && delta !== 0 && (
                <span
                  className={`inline-flex items-center gap-0.5 font-medium ${
                    delta > 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {delta > 0 ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {Math.abs(delta).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
          <div
            className={`shrink-0 grid h-10 w-10 place-items-center rounded-lg ${
              tone === "warn"
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary"
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} aria-label={title}>
      {content}
    </Link>
  ) : (
    content
  );
}

function StockStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="rounded-md bg-muted/60 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-lg font-bold tabular-nums ${tone === "warn" ? "text-destructive" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function PaymentBadge({ balance, total }: { balance: number; total: number }) {
  if (balance <= 0.5) {
    return (
      <Badge variant="secondary" className="text-[10px] bg-success/15 text-success border-0">
        Paid
      </Badge>
    );
  }
  if (balance >= total - 0.5) {
    return (
      <Badge variant="destructive" className="text-[10px]">
        Credit
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] border-warning/40 text-warning bg-warning/10"
    >
      Partial
    </Badge>
  );
}

function EmptyState({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="py-8 text-center">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-1 mb-4">{description}</div>
      {cta}
    </div>
  );
}
