import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/auth-helpers";
import { getAllBills } from "@/lib/queries";
import { db, schema } from "@/db";
import { fyOf, money, pad2, r2, today } from "@/lib/format";
import { SumGrid } from "@/components/sum-grid";
import { FYFilter } from "./fy-filter";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ fy?: string }> };

export default async function ProfitPage({ searchParams }: Props) {
  await requireOwner();
  const sp = await searchParams;

  const [allBills, expenses] = await Promise.all([
    getAllBills(true),
    db.select().from(schema.expenses),
  ]);

  const allFys = Array.from(
    new Set(allBills.map((b) => b.fy).concat(fyOf(today()))),
  ).sort().reverse();

  const fy = sp.fy || allFys[0] || fyOf(today());
  const useAll = fy === "all";

  const bills = useAll ? allBills : allBills.filter((b) => b.fy === fy);
  const scopedExpenses = useAll
    ? expenses
    : expenses.filter((e) => fyOf(e.date) === fy);

  const totalProfit = bills.reduce((s, b) => s + (b.profit ?? 0), 0);
  const kgSold = bills.reduce((s, b) => s + b.kg, 0);
  const sales = bills.reduce((s, b) => s + b.amount, 0);
  const exp = scopedExpenses.reduce((s, e) => s + Number(e.amount), 0);

  // Day-wise profit — group bills + non-hamali expenses by date.
  const byDayMap = new Map<
    string,
    { bills: number; bags: number; sales: number; profit: number; exp: number }
  >();
  for (const b of bills) {
    const row = byDayMap.get(b.date) ?? {
      bills: 0,
      bags: 0,
      sales: 0,
      profit: 0,
      exp: 0,
    };
    row.bills += 1;
    row.bags += b.bags;
    row.sales += b.amount;
    row.profit += b.profit ?? 0;
    byDayMap.set(b.date, row);
  }
  for (const e of scopedExpenses) {
    if (e.isHamali) continue;
    const row = byDayMap.get(e.date) ?? {
      bills: 0,
      bags: 0,
      sales: 0,
      profit: 0,
      exp: 0,
    };
    row.exp += Number(e.amount);
    byDayMap.set(e.date, row);
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([date, row]) => ({ date, ...row }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const dayTotals = {
    bills: byDay.reduce((s, r) => s + r.bills, 0),
    bags: byDay.reduce((s, r) => s + r.bags, 0),
    sales: byDay.reduce((s, r) => s + r.sales, 0),
    profit: byDay.reduce((s, r) => s + r.profit, 0),
    exp: byDay.reduce((s, r) => s + r.exp, 0),
  };

  const byLotMap = new Map<
    string,
    { name: string; bags: number; kg: number; sales: number; profit: number; billIds: Set<string> }
  >();
  for (const b of bills) {
    for (const it of b.items) {
      const row =
        byLotMap.get(it.lotId) ??
        { name: it.lotName, bags: 0, kg: 0, sales: 0, profit: 0, billIds: new Set<string>() };
      row.bags += it.bags;
      row.kg += it.kg;
      row.sales += it.amount;
      row.profit += it.profit ?? 0;
      row.billIds.add(b.id);
      byLotMap.set(it.lotId, row);
    }
  }
  const byLot = Array.from(byLotMap.values())
    .map((l) => ({ ...l, bills: l.billIds.size }))
    .sort((a, b) => b.profit - a.profit);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FYFilter options={allFys} value={fy} />
          <SumGrid
            items={[
              ["Total profit", money(totalProfit)],
              ["Expenses", money(exp)],
              ["Profit after expenses", money(totalProfit - exp)],
              ["Sales (before hamali & GST)", money(sales)],
              ["Bills", String(bills.length)],
              ["Kg sold", r2(kgSold).toString()],
              ["Profit per kg", money(kgSold ? totalProfit / kgSold : 0)],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Day-wise profit</CardTitle>
        </CardHeader>
        <CardContent>
          {byDay.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bills in this period yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4 text-right">Bills</th>
                    <th className="py-2 pr-4 text-right">Bags</th>
                    <th className="py-2 pr-4 text-right">Sales</th>
                    <th className="py-2 pr-4 text-right">Profit</th>
                    <th className="py-2 pr-4 text-right">Expenses</th>
                    <th className="py-2 pr-4 text-right">Profit after expenses</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.map((r) => (
                    <tr key={r.date} className="border-b last:border-0">
                      <td className="py-2 pr-4">{r.date}</td>
                      <td className="py-2 pr-4 text-right">{r.bills}</td>
                      <td className="py-2 pr-4 text-right">{r.bags}</td>
                      <td className="py-2 pr-4 text-right">{money(r.sales)}</td>
                      <td
                        className={`py-2 pr-4 text-right ${r.profit < 0 ? "text-destructive" : ""}`}
                      >
                        {money(r.profit)}
                      </td>
                      <td className="py-2 pr-4 text-right">{money(r.exp)}</td>
                      <td
                        className={`py-2 pr-4 text-right ${r.profit - r.exp < 0 ? "text-destructive" : ""}`}
                      >
                        {money(r.profit - r.exp)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-4">Total</td>
                    <td className="py-2 pr-4 text-right">{dayTotals.bills}</td>
                    <td className="py-2 pr-4 text-right">{dayTotals.bags}</td>
                    <td className="py-2 pr-4 text-right">{money(dayTotals.sales)}</td>
                    <td
                      className={`py-2 pr-4 text-right ${dayTotals.profit < 0 ? "text-destructive" : ""}`}
                    >
                      {money(dayTotals.profit)}
                    </td>
                    <td className="py-2 pr-4 text-right">{money(dayTotals.exp)}</td>
                    <td
                      className={`py-2 pr-4 text-right ${dayTotals.profit - dayTotals.exp < 0 ? "text-destructive" : ""}`}
                    >
                      {money(dayTotals.profit - dayTotals.exp)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profit by lot</CardTitle>
        </CardHeader>
        <CardContent>
          {byLot.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bills in this period yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Lot / quality</th>
                    <th className="py-2 pr-4 text-right">Bills</th>
                    <th className="py-2 pr-4 text-right">Bags</th>
                    <th className="py-2 pr-4 text-right">Kg</th>
                    <th className="py-2 pr-4 text-right">Sales</th>
                    <th className="py-2 pr-4 text-right">Cost</th>
                    <th className="py-2 pr-4 text-right">Profit</th>
                    <th className="py-2 pr-4 text-right">Per kg</th>
                  </tr>
                </thead>
                <tbody>
                  {byLot.map((l) => (
                    <tr key={l.name} className="border-b last:border-0">
                      <td className="py-2 pr-4">{l.name}</td>
                      <td className="py-2 pr-4 text-right">{l.bills}</td>
                      <td className="py-2 pr-4 text-right">{l.bags}</td>
                      <td className="py-2 pr-4 text-right">{r2(l.kg)}</td>
                      <td className="py-2 pr-4 text-right">{money(l.sales)}</td>
                      <td className="py-2 pr-4 text-right">{money(l.sales - l.profit)}</td>
                      <td
                        className={`py-2 pr-4 text-right ${l.profit < 0 ? "text-destructive" : ""}`}
                      >
                        {money(l.profit)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {money(l.kg ? l.profit / l.kg : 0)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-4">Total</td>
                    <td className="py-2 pr-4 text-right">{bills.length}</td>
                    <td className="py-2 pr-4 text-right">
                      {byLot.reduce((s, l) => s + l.bags, 0)}
                    </td>
                    <td className="py-2 pr-4 text-right">{r2(kgSold)}</td>
                    <td className="py-2 pr-4 text-right">{money(sales)}</td>
                    <td className="py-2 pr-4 text-right">{money(sales - totalProfit)}</td>
                    <td className="py-2 pr-4 text-right">{money(totalProfit)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profit on each bill</CardTitle>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bills in this period yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Bill no.</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Lot</th>
                    <th className="py-2 pr-4 text-right">Kg</th>
                    <th className="py-2 pr-4 text-right">Sales</th>
                    <th className="py-2 pr-4 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {[...bills].reverse().map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">{pad2(b.no)}</td>
                      <td className="py-2 pr-4">{b.date}</td>
                      <td className="py-2 pr-4">{b.customer}</td>
                      <td className="py-2 pr-4">{b.lotSummary}</td>
                      <td className="py-2 pr-4 text-right">{r2(b.kg)}</td>
                      <td className="py-2 pr-4 text-right">{money(b.amount)}</td>
                      <td
                        className={`py-2 pr-4 text-right ${(b.profit ?? 0) < 0 ? "text-destructive" : ""}`}
                      >
                        {money(b.profit ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
