import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireOwner } from "@/lib/auth-helpers";
import { fmtDate, money, pad2 } from "@/lib/format";
import { FY_RE, archiveBills, readArchive } from "@/lib/year-close";
import { ArchiveDownloads } from "./archive-downloads";

export const dynamic = "force-dynamic";

const SHOW = 300;

type Props = {
  params: Promise<{ fy: string }>;
  searchParams: Promise<{ q?: string }>;
};

export default async function ArchivePage({ params, searchParams }: Props) {
  await requireOwner();
  const { fy } = await params;
  const q = ((await searchParams).q ?? "").trim().toLowerCase();
  if (!FY_RE.test(fy)) notFound();
  const row = await readArchive(fy);
  if (!row) notFound();
  const { data } = row;
  const pending = row.status === "pending";

  const bills = archiveBills(data);
  const matches = q
    ? bills.filter((b) => b.customer.toLowerCase().includes(q) || String(b.no) === q)
    : bills;
  const settled = bills.filter((b) => b.settled);
  const open = bills.filter((b) => !b.settled);
  const expenses = data.removed.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const expenseRows = [...data.removed.expenses].sort((a, b) => a.date.localeCompare(b.date));
  const carriedBags = data.carryForward.stock.reduce((s, l) => s + l.main + l.nm, 0);

  return (
    <div className="space-y-6">
      <section className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Archive {fy}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {pending ? "Archived" : "Closed"} on {data.closedAt.slice(0, 10)} · records up to{" "}
            {data.closedThrough} · read only
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ArchiveDownloads fy={fy} />
          <Link href="/settings">
            <Button variant="outline" size="sm">
              Back to settings
            </Button>
          </Link>
        </div>
      </section>

      {pending && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/5 p-4 text-sm">
          <b>Waiting for your check.</b> Nothing has been removed from the live data yet. Compare
          these bills and expenses with your books, then confirm or discard the archive in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          .
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          title={pending ? "Settled bills (to be removed)" : "Settled bills archived"}
          value={String(settled.length)}
          sub={money(settled.reduce((s, b) => s + Number(b.total), 0))}
        />
        <Stat
          title="Still owed at close (kept live)"
          value={String(open.length)}
          sub={`${money(open.reduce((s, b) => s + b.balance, 0))} due`}
        />
        <Stat
          title={pending ? "Expenses (to be removed)" : "Expenses archived"}
          value={String(data.removed.expenses.length)}
          sub={money(expenses)}
        />
        {data.carryForward.closingNm ? (
          <Stat
            title="Closing cash / bank (Main · New Mahavir)"
            value={`${money(data.carryForward.closing.cash)} · ${money(data.carryForward.closingNm.cash)}`}
            sub={`Bank ${money(data.carryForward.closing.bank)} · ${money(data.carryForward.closingNm.bank)} · ${carriedBags} bags carried`}
          />
        ) : (
          <Stat
            title="Closing cash / bank"
            value={money(data.carryForward.closing.cash)}
            sub={`Bank ${money(data.carryForward.closing.bank)} · ${carriedBags} bags carried`}
          />
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Bills</CardTitle>
          <form className="flex gap-2 max-w-sm" method="get">
            <Input name="q" defaultValue={q} placeholder="Customer or bill no" />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bills match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">No</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Lot</th>
                    <th className="py-2 pr-4 text-right">Total</th>
                    <th className="py-2 pr-4 text-right">Paid</th>
                    <th className="py-2 pr-4 text-right">Balance</th>
                    <th className="py-2 pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {matches.slice(0, SHOW).map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        {b.kind === "gst" ? "GST " : ""}
                        {pad2(b.no)}
                        {b.fy !== fy && (
                          <span className="text-muted-foreground"> ({b.fy})</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{fmtDate(b.date)}</td>
                      <td className="py-2 pr-4">{b.customer}</td>
                      <td className="py-2 pr-4">{b.lots}</td>
                      <td className="py-2 pr-4 text-right">{money(b.total)}</td>
                      <td className="py-2 pr-4 text-right">{money(b.paid)}</td>
                      <td className="py-2 pr-4 text-right">{money(b.balance)}</td>
                      <td className="py-2 pr-0 text-right">
                        {b.settled ? (
                          <Badge variant="secondary">Settled</Badge>
                        ) : (
                          <Badge variant="destructive">Owed at close</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {matches.length > SHOW && (
                <p className="text-xs text-muted-foreground pt-2">
                  Showing {SHOW} of {matches.length}. Search, or download the CSV for all.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {expenseRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this archive.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Note</th>
                    <th className="py-2 pr-4">Mode</th>
                    <th className="py-2 pr-0 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.slice(0, SHOW).map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{fmtDate(e.date)}</td>
                      <td className="py-2 pr-4">{e.category}</td>
                      <td className="py-2 pr-4">{e.note}</td>
                      <td className="py-2 pr-4">{e.mode}</td>
                      <td className="py-2 pr-0 text-right">{money(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {expenseRows.length > SHOW && (
                <p className="text-xs text-muted-foreground pt-2">
                  Showing {SHOW} of {expenseRows.length}. Download the JSON for all.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-sm text-muted-foreground">{title}</p>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
