import { eq, lt, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cashBalanceBefore,
  getAllPaymentsOnDate,
  getBillsByDate,
  getCustomerBalances,
  getExpensesByDate,
  getSettings,
} from "@/lib/queries";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth-helpers";
import { getCurrentLoc } from "@/lib/loc";
import { money, pad2, r2, today } from "@/lib/format";
import { DateFilter } from "@/components/date-filter";
import { SumGrid } from "@/components/sum-grid";
import { Button } from "@/components/ui/button";
import { OpeningBalanceButton } from "./opening-balance-button";
import { CloseDayCard } from "./close-day-card";
import {
  ExpenseQuickButton,
  ReceiveQuickButton,
} from "./quick-entry-buttons";
import Link from "next/link";
import { ExcelButton } from "@/components/excel-button";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ d?: string }> };

export default async function LedgerPage({ searchParams }: Props) {
  const sp = await searchParams;
  const date = sp.d || today();
  const session = await requireSession();
  const role = session.user.role;
  const isOwner = role === "owner";
  const canEditClosing = role === "owner" || role === "editor";

  const [
    bills,
    pays,
    expenses,
    settings,
    openCash,
    openBank,
    existingClosing,
    cjSettlementsToday,
    cjSettlementsBeforeRow,
    cjReceivedBeforeRow,
    customerBalances,
    loc,
    pattiPaidToday,
  ] = await Promise.all([
    getBillsByDate(date, isOwner),
    getAllPaymentsOnDate(date),
    getExpensesByDate(date),
    getSettings(),
    cashBalanceBefore("Cash", date),
    cashBalanceBefore("UPI", date),
    db.query.closings.findFirst({ where: eq(schema.closings.date, date) }),
    db
      .select({ mode: schema.cjSettlements.mode, amount: schema.cjSettlements.amount })
      .from(schema.cjSettlements)
      .where(eq(schema.cjSettlements.date, date)),
    db
      .select({ s: sql<string>`coalesce(sum(${schema.cjSettlements.amount}), 0)` })
      .from(schema.cjSettlements)
      .where(lt(schema.cjSettlements.date, date))
      .then((r) => r[0]),
    db
      .select({ s: sql<string>`coalesce(sum(${schema.payments.amount}), 0)` })
      .from(schema.payments)
      .where(sql`${schema.payments.mode} = 'CJ' AND ${schema.payments.date} < ${date}`)
      .then((r) => r[0]),
    getCustomerBalances(),
    getCurrentLoc(),
    isOwner
      ? db
          .select({
            id: schema.pattiBills.id,
            no: schema.pattiBills.no,
            party: schema.pattiBills.party,
            paidMode: schema.pattiBills.paidMode,
            net: schema.pattiBills.net,
          })
          .from(schema.pattiBills)
          .where(eq(schema.pattiBills.paidDate, date))
          .orderBy(schema.pattiBills.no)
      : Promise.resolve(
          [] as {
            id: string;
            no: number;
            party: string;
            paidMode: string | null;
            net: string;
          }[],
        ),
  ]);

  const cashIn = pays.filter((p) => p.mode === "Cash").reduce((s, p) => s + Number(p.amount), 0);
  const upiIn = pays.filter((p) => p.mode === "UPI").reduce((s, p) => s + Number(p.amount), 0);
  const cjIn = pays.filter((p) => p.mode === "CJ").reduce((s, p) => s + Number(p.amount), 0);

  function statsFor(loc: "MS" | "NM") {
    const bs = bills.filter((b) => b.loc === loc);
    const ps = pays.filter(
      (p) => (p.billLoc === "NM" ? "NM" : "MS") === loc,
    );
    const ex = expenses.filter(
      (e) => (e.loc === "NM" ? "NM" : "MS") === loc,
    );
    const sumPay = (m: "Cash" | "UPI" | "CJ") =>
      ps.filter((p) => p.mode === m).reduce((s, p) => s + Number(p.amount), 0);
    const sumExp = (m: "Cash" | "UPI") =>
      ex.filter((e) => e.mode === m).reduce((s, e) => s + Number(e.amount), 0);
    const sIn = sumPay("Cash");
    const uIn = sumPay("UPI");
    const cIn = sumPay("CJ");
    const cExp = sumExp("Cash");
    const uExp = sumExp("UPI");
    return {
      sales: bs.reduce((s, b) => s + b.total, 0),
      cashIn: sIn,
      upiIn: uIn,
      cjIn: cIn,
      cashExp: cExp,
      upiExp: uExp,
      netCash: sIn - cExp,
      profit: isOwner ? bs.reduce((s, b) => s + (b.profit ?? 0), 0) : 0,
    };
  }
  const storeRows: { name: string; stats: ReturnType<typeof statsFor> }[] = [
    { name: "Main store", stats: statsFor("MS") },
    { name: "New Mahavir", stats: statsFor("NM") },
  ];
  const storeTotals = {
    sales: storeRows.reduce((s, r) => s + r.stats.sales, 0),
    cashIn: storeRows.reduce((s, r) => s + r.stats.cashIn, 0),
    upiIn: storeRows.reduce((s, r) => s + r.stats.upiIn, 0),
    cjIn: storeRows.reduce((s, r) => s + r.stats.cjIn, 0),
    cashExp: storeRows.reduce((s, r) => s + r.stats.cashExp, 0),
    upiExp: storeRows.reduce((s, r) => s + r.stats.upiExp, 0),
    netCash: storeRows.reduce((s, r) => s + r.stats.netCash, 0),
    profit: storeRows.reduce((s, r) => s + r.stats.profit, 0),
  };
  const cashOut = expenses
    .filter((e) => e.mode === "Cash")
    .reduce((s, e) => s + Number(e.amount), 0);
  const upiOut = expenses
    .filter((e) => e.mode === "UPI")
    .reduce((s, e) => s + Number(e.amount), 0);
  const cjSettledCash = cjSettlementsToday
    .filter((x) => x.mode === "Cash")
    .reduce((s, x) => s + Number(x.amount), 0);
  const cjSettledUpi = cjSettlementsToday
    .filter((x) => x.mode === "UPI")
    .reduce((s, x) => s + Number(x.amount), 0);
  const pattiPaidCash = pattiPaidToday
    .filter((p) => p.paidMode === "Cash")
    .reduce((s, p) => s + Number(p.net), 0);
  const pattiPaidUpi = pattiPaidToday
    .filter((p) => p.paidMode === "UPI")
    .reduce((s, p) => s + Number(p.net), 0);
  const cjOpening =
    Number(settings.cjOpening ?? 0) +
    Number(cjReceivedBeforeRow?.s ?? 0) -
    Number(cjSettlementsBeforeRow?.s ?? 0);
  const sales = bills.reduce((s, b) => s + b.total, 0);
  const credit = bills.reduce((s, b) => s + b.balance, 0);
  const profit = isOwner ? bills.reduce((s, b) => s + (b.profit ?? 0), 0) : 0;
  const bookCashClose = openCash + cashIn + cjSettledCash - cashOut - pattiPaidCash;
  const bookBankClose = openBank + upiIn + cjSettledUpi - upiOut - pattiPaidUpi;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Daily ledger</CardTitle>
        </CardHeader>
        <CardContent className="flex items-end gap-3 flex-wrap">
          <DateFilter paramKey="d" value={date} />
          <Link href={`/ledger/print?d=${date}`} target="_blank">
            <Button type="button" variant="outline" size="sm">
              Print ledger
            </Button>
          </Link>
          <ExcelButton report="ledger" date={date} label="Ledger (Excel)" />
          <ExcelButton
            report="day"
            date={date}
            label="Full day report (Excel)"
            variant="default"
          />
          <ReceiveQuickButton
            defaultDate={date}
            customerNames={customerBalances.map((c) => c.name)}
          />
          <ExpenseQuickButton defaultDate={date} defaultLoc={loc} />
          {isOwner && (
            <OpeningBalanceButton
              openingCash={Number(settings.openingCash)}
              openingBank={Number(settings.openingBank)}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Close the day</CardTitle>
          <p className="text-sm text-muted-foreground">
            After entering all bills and expenses for {date}, count your cash and (if you
            can) check the bank balance, then save it as the closing. Tomorrow&apos;s
            opening uses this number.
          </p>
        </CardHeader>
        <CardContent>
          <CloseDayCard
            date={date}
            bookCash={bookCashClose}
            bookBank={bookBankClose}
            existingCash={existingClosing?.cash ?? null}
            existingBank={existingClosing?.bank ?? null}
            canEdit={canEditClosing}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By store</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4">Store</th>
                  <th className="py-2 pr-4 text-right">Sales</th>
                  <th className="py-2 pr-4 text-right">Cash in</th>
                  <th className="py-2 pr-4 text-right">UPI in</th>
                  <th className="py-2 pr-4 text-right">CJ in</th>
                  <th className="py-2 pr-4 text-right">Cash exp.</th>
                  <th className="py-2 pr-4 text-right">UPI exp.</th>
                  <th className="py-2 pr-4 text-right">Net cash</th>
                  {isOwner && <th className="py-2 pr-4 text-right">Profit</th>}
                </tr>
              </thead>
              <tbody>
                {storeRows.map((r) => (
                  <tr key={r.name} className="border-b">
                    <td className="py-2 pr-4 font-medium">{r.name}</td>
                    <td className="py-2 pr-4 text-right">{money(r.stats.sales)}</td>
                    <td className="py-2 pr-4 text-right">{money(r.stats.cashIn)}</td>
                    <td className="py-2 pr-4 text-right">{money(r.stats.upiIn)}</td>
                    <td className="py-2 pr-4 text-right">{money(r.stats.cjIn)}</td>
                    <td className="py-2 pr-4 text-right">{money(r.stats.cashExp)}</td>
                    <td className="py-2 pr-4 text-right">{money(r.stats.upiExp)}</td>
                    <td className="py-2 pr-4 text-right">{money(r.stats.netCash)}</td>
                    {isOwner && (
                      <td className="py-2 pr-4 text-right">{money(r.stats.profit)}</td>
                    )}
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-4">Total</td>
                  <td className="py-2 pr-4 text-right">{money(storeTotals.sales)}</td>
                  <td className="py-2 pr-4 text-right">{money(storeTotals.cashIn)}</td>
                  <td className="py-2 pr-4 text-right">{money(storeTotals.upiIn)}</td>
                  <td className="py-2 pr-4 text-right">{money(storeTotals.cjIn)}</td>
                  <td className="py-2 pr-4 text-right">{money(storeTotals.cashExp)}</td>
                  <td className="py-2 pr-4 text-right">{money(storeTotals.upiExp)}</td>
                  <td className="py-2 pr-4 text-right">{money(storeTotals.netCash)}</td>
                  {isOwner && (
                    <td className="py-2 pr-4 text-right">{money(storeTotals.profit)}</td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Net cash = cash received − cash expenses.
            {isOwner ? " Patti payments (owner) are not split by store." : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cash in hand</CardTitle>
        </CardHeader>
        <CardContent>
          <SumGrid
            items={[
              ["Opening", money(openCash)],
              ["Cash received", money(cashIn)],
              ["From CJ (settled)", money(cjSettledCash)],
              ["Cash expenses", money(cashOut)],
              ...(isOwner
                ? ([["Purchases paid (cash)", money(pattiPaidCash)]] as [string, string][])
                : []),
              ["Closing", money(bookCashClose)],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank / UPI</CardTitle>
        </CardHeader>
        <CardContent>
          <SumGrid
            items={[
              ["Opening", money(openBank)],
              ["UPI received", money(upiIn)],
              ["From CJ (settled)", money(cjSettledUpi)],
              ["UPI expenses", money(upiOut)],
              ...(isOwner
                ? ([["Purchases paid (UPI)", money(pattiPaidUpi)]] as [string, string][])
                : []),
              ["Closing", money(bookBankClose)],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CJ (money held by CJ)</CardTitle>
        </CardHeader>
        <CardContent>
          <SumGrid
            items={[
              ["Opening", money(cjOpening)],
              ["Received via CJ", money(cjIn)],
              ["CJ paid you", money(cjSettledCash + cjSettledUpi)],
              [
                "Closing",
                money(cjOpening + cjIn - cjSettledCash - cjSettledUpi),
              ],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Day result</CardTitle>
        </CardHeader>
        <CardContent>
          <SumGrid
            items={[
              ["Sales (total)", money(sales)],
              ["Balance given (credit)", money(credit)],
              ...(isOwner
                ? ([["Profit on bills", money(profit)]] as [string, string][])
                : []),
              ["Expenses", money(cashOut + upiOut)],
              ...(isOwner
                ? ([
                    ["Profit after expenses", money(profit - cashOut - upiOut)],
                  ] as [string, string][])
                : []),
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Money received</CardTitle>
        </CardHeader>
        <CardContent>
          {pays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No money received on this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Bill no.</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Mode</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pays.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">{pad2(p.billNo)}</td>
                      <td className="py-2 pr-4">{p.customer}</td>
                      <td className="py-2 pr-4">{p.mode}</td>
                      <td className="py-2 pr-4 text-right">{money(p.amount)}</td>
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
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No expenses on this date. Add them in the Expenses tab.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Note</th>
                    <th className="py-2 pr-4">Paid by</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{e.category}</td>
                      <td className="py-2 pr-4">{e.note ?? ""}</td>
                      <td className="py-2 pr-4">{e.mode}</td>
                      <td className="py-2 pr-4 text-right">{money(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Purchases paid (patti + GST purchase)</CardTitle>
          </CardHeader>
          <CardContent>
            {pattiPaidToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No patti payments on this date.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-4">Patti no.</th>
                      <th className="py-2 pr-4">Seller</th>
                      <th className="py-2 pr-4">Paid by</th>
                      <th className="py-2 pr-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pattiPaidToday.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-mono">{pad2(p.no)}</td>
                        <td className="py-2 pr-4">{p.party}</td>
                        <td className="py-2 pr-4">{p.paidMode ?? ""}</td>
                        <td className="py-2 pr-4 text-right">{money(p.net)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-2 pr-4">Total</td>
                      <td />
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        Cash {money(pattiPaidCash)} · UPI {money(pattiPaidUpi)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {money(pattiPaidCash + pattiPaidUpi)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sales</CardTitle>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bills on this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Bill no.</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Lot</th>
                    <th className="py-2 pr-4 text-right">Bags</th>
                    <th className="py-2 pr-4 text-right">Kg</th>
                    <th className="py-2 pr-4 text-right">Total</th>
                    <th className="py-2 pr-4 text-right">Paid</th>
                    <th className="py-2 pr-4 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">{pad2(b.no)}</td>
                      <td className="py-2 pr-4">{b.customer}</td>
                      <td className="py-2 pr-4">{b.lotSummary}</td>
                      <td className="py-2 pr-4 text-right">{b.bags}</td>
                      <td className="py-2 pr-4 text-right">{r2(b.kg)}</td>
                      <td className="py-2 pr-4 text-right">{money(b.total)}</td>
                      <td className="py-2 pr-4 text-right">{money(b.paid)}</td>
                      <td
                        className={`py-2 pr-4 text-right ${b.balance > 0.5 ? "text-destructive" : ""}`}
                      >
                        {money(b.balance)}
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
