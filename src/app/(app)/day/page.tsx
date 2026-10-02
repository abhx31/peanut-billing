import { requireSession } from "@/lib/auth-helpers";
import {
  getAllPaymentsOnDate,
  getBillsByDate,
  getCustomerBalances,
  getLotsWithStock,
} from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { money, r2, today } from "@/lib/format";
import { DateFilter } from "@/components/date-filter";
import { BillRowActions } from "../bills/bill-row-actions";
import { SumGrid } from "@/components/sum-grid";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ d?: string }> };

export default async function DailySummaryPage({ searchParams }: Props) {
  const sp = await searchParams;
  const date = sp.d || today();
  const session = await requireSession();
  const isOwner = session.user.role === "owner";

  const [bills, pays, lots, balances] = await Promise.all([
    getBillsByDate(date, isOwner),
    getAllPaymentsOnDate(date),
    getLotsWithStock(),
    getCustomerBalances(),
  ]);

  const totalSales = bills.reduce((s, b) => s + b.total, 0);
  const credit = bills.reduce((s, b) => s + b.balance, 0);
  const cashIn = pays.filter((p) => p.mode === "Cash").reduce((s, p) => s + Number(p.amount), 0);
  const upiIn = pays.filter((p) => p.mode === "UPI").reduce((s, p) => s + Number(p.amount), 0);
  const bagsSold = bills.reduce((s, b) => s + b.bags, 0);
  const totalPending = balances.reduce((s, c) => s + c.balance, 0);
  const profitToday = isOwner ? bills.reduce((s, b) => s + (b.profit ?? 0), 0) : null;

  const summary: [string, string][] = [
    ["Sales (total)", money(totalSales)],
    ["Cash received", money(cashIn)],
    ["UPI / bank received", money(upiIn)],
    ["Total received", money(cashIn + upiIn)],
    ["Balance given today (credit)", money(credit)],
    ...(profitToday !== null ? ([["Profit today", money(profitToday)]] as [string, string][]) : []),
    ["Bags sold", String(bagsSold)],
    ["All pending balances", money(totalPending)],
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Daily summary</CardTitle>
        </CardHeader>
        <CardContent>
          <DateFilter paramKey="d" value={date} />
          <div className="mt-4">
            <SumGrid items={summary} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bills on {date}</CardTitle>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bills on this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Lot</th>
                    <th className="py-2 pr-4 text-right">Bags</th>
                    <th className="py-2 pr-4 text-right">Kg</th>
                    <th className="py-2 pr-4 text-right">Total</th>
                    <th className="py-2 pr-4 text-right">Paid</th>
                    <th className="py-2 pr-4 text-right">Balance</th>
                    {isOwner && <th className="py-2 pr-4 text-right">Profit</th>}
                    <th className="py-2 pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">{String(b.no).padStart(2, "0")}</td>
                      <td className="py-2 pr-4">{b.customer}</td>
                      <td className="py-2 pr-4">
                        <span>{b.lotSummary}</span>
                        {b.itemCount > 1 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({b.itemCount} lots)
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right">{b.bags}</td>
                      <td className="py-2 pr-4 text-right">{r2(b.kg)}</td>
                      <td className="py-2 pr-4 text-right">{money(b.total)}</td>
                      <td className="py-2 pr-4 text-right">{money(b.paid)}</td>
                      <td
                        className={`py-2 pr-4 text-right ${b.balance > 0.5 ? "text-destructive" : ""}`}
                      >
                        {money(b.balance)}
                      </td>
                      {isOwner && (
                        <td className="py-2 pr-4 text-right">{money(b.profit ?? 0)}</td>
                      )}
                      <td className="py-2 pr-0 text-right">
                        <BillRowActions billId={b.id} billNo={b.no} balance={b.balance} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stock left</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4">Lot / quality</th>
                  <th className="py-2 pr-4 text-right">Bags left</th>
                </tr>
              </thead>
              <tbody>
                {lots.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-2 text-muted-foreground">
                      No lots yet.
                    </td>
                  </tr>
                ) : (
                  lots.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{l.name}</td>
                      <td
                        className={`py-2 pr-4 text-right font-semibold ${l.left <= 0 ? "text-destructive" : ""}`}
                      >
                        {l.left}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
