import { requireSession } from "@/lib/auth-helpers";
import {
  getAllPaymentsOnDate,
  getBillsByDate,
  getCustomerBalances,
  getLotsWithStock,
  lotStockAt,
} from "@/lib/queries";
import { getCurrentLoc, locLabel } from "@/lib/loc";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate, money, r2, today } from "@/lib/format";
import { DateFilter } from "@/components/date-filter";
import { BillRowActions } from "../bills/bill-row-actions";
import { EditBillDialog } from "../bills/edit-bill-dialog";
import { SumGrid } from "@/components/sum-grid";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ d?: string }> };

export default async function DailySummaryPage({ searchParams }: Props) {
  const sp = await searchParams;
  const date = sp.d || today();
  const session = await requireSession();
  const role = session.user.role;
  const isOwner = role === "owner";
  const canEditBill = isOwner || role === "editor";
  const loc = await getCurrentLoc();
  const storeName = locLabel(loc);

  const [bills, pays, allLots, lotsOnDate, balances] = await Promise.all([
    getBillsByDate(date, isOwner, loc),
    getAllPaymentsOnDate(date, loc),
    getLotsWithStock(),
    // The "Stock left" table is the closing stock at the end of this date.
    getLotsWithStock({ asOf: date }),
    getCustomerBalances(loc),
  ]);
  // Current stock, for the edit-bill dialog's "bags left" hints.
  const lotsHere = allLots.map((l) => ({ id: l.id, name: l.name, ...lotStockAt(l, loc) }));
  const lots = lotsOnDate
    .map((l) => ({ id: l.id, name: l.name, ...lotStockAt(l, loc) }))
    .filter((l) => l.known);

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
          <CardTitle>Daily summary · {storeName}</CardTitle>
          <CardAction>
            <DateFilter paramKey="d" value={date} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <SumGrid items={summary} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bills on {fmtDate(date)}</CardTitle>
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
                        <div className="flex gap-1 justify-end flex-wrap">
                          {canEditBill && b.items.length > 0 && (
                            <EditBillDialog
                              billId={b.id}
                              billNo={b.no}
                              billDate={b.date}
                              customer={b.customer}
                              hamaliPerBag={b.hamaliPerBag}
                              items={b.items.map((it) => ({
                                id: it.id,
                                lotId: it.lotId,
                                lotName: it.lotName,
                                bags: it.bags,
                                kg: it.kg,
                                rate: it.rate,
                                weightsText: it.weightsText,
                              }))}
                              lots={lotsHere.map((l) => ({
                                id: l.id,
                                name: l.name,
                                left: l.left,
                              }))}
                            />
                          )}
                          <BillRowActions billId={b.id} billNo={b.no} balance={b.balance} />
                        </div>
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
          <CardTitle>
            Closing stock on {fmtDate(date)} · {storeName}
          </CardTitle>
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
