import { eq, lt, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cashBalanceBefore,
  getAllPaymentsOnDate,
  getBillsByDate,
  getCashDepositsOnDate,
  getCustomerBalances,
  getExpensesByDate,
  getSettings,
} from "@/lib/queries";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth-helpers";
import { getCurrentLoc } from "@/lib/loc";
import { fmtDate, money, pad2, r2, today } from "@/lib/format";
import { DateFilter } from "@/components/date-filter";
import { SumGrid } from "@/components/sum-grid";
import { Button } from "@/components/ui/button";
import { OpeningBalanceButton } from "./opening-balance-button";
import { CloseDayCard } from "./close-day-card";
import {
  ExpenseQuickButton,
  ReceiveQuickButton,
} from "./quick-entry-buttons";
import { DeleteReceiptButton } from "./delete-receipt-button";
import Link from "next/link";
import { ExcelButton } from "@/components/excel-button";
import { LedgerTAccount } from "@/components/ledger-t-account";
import { CashDepositDialog } from "../cash-deposits/cash-deposit-dialog";
import { DeleteCashDepositButton } from "../cash-deposits/delete-cash-deposit-button";

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
    pattiPaidCJBeforeRow,
    customerBalances,
    loc,
    openingPaymentsToday,
    pattiPaidTodayByMode,
    pattiPaidToday,
    depositsToday,
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
    db
      .select({ s: sql<string>`coalesce(sum(${schema.pattiPayments.amount}), 0)` })
      .from(schema.pattiPayments)
      .where(sql`${schema.pattiPayments.mode} = 'CJ' AND ${schema.pattiPayments.date} < ${date}`)
      .then((r) => r[0]),
    getCustomerBalances(),
    getCurrentLoc(),
    db
      .select({
        id: schema.openingPayments.id,
        customer: schema.openingPayments.customer,
        mode: schema.openingPayments.mode,
        amount: schema.openingPayments.amount,
        loc: schema.openingPayments.loc,
        note: schema.openingPayments.note,
        dueNote: schema.openingDues.note,
        dueAmount: schema.openingDues.amount,
      })
      .from(schema.openingPayments)
      .leftJoin(
        schema.openingDues,
        eq(schema.openingDues.id, schema.openingPayments.openingDueId),
      )
      .where(eq(schema.openingPayments.date, date)),
    // Aggregate only — always fetched regardless of role, so the Cash/Bank/CJ
    // closing balances stay correct for everyone. Who got paid (the detailed
    // breakdown below) stays owner-only.
    db
      .select({
        mode: schema.pattiPayments.mode,
        s: sql<string>`coalesce(sum(${schema.pattiPayments.amount}), 0)`,
      })
      .from(schema.pattiPayments)
      .where(eq(schema.pattiPayments.date, date))
      .groupBy(schema.pattiPayments.mode),
    isOwner
      ? db
          .select({
            id: schema.pattiPayments.id,
            pattiNo: schema.pattiBills.no,
            party: schema.pattiBills.party,
            mode: schema.pattiPayments.mode,
            amount: schema.pattiPayments.amount,
          })
          .from(schema.pattiPayments)
          .innerJoin(schema.pattiBills, eq(schema.pattiBills.id, schema.pattiPayments.pattiId))
          .where(eq(schema.pattiPayments.date, date))
          .orderBy(schema.pattiBills.no)
      : Promise.resolve(
          [] as {
            id: string;
            pattiNo: number;
            party: string;
            mode: string;
            amount: string;
          }[],
        ),
    getCashDepositsOnDate(date),
  ]);

  const cashIn =
    pays.filter((p) => p.mode === "Cash").reduce((s, p) => s + Number(p.amount), 0) +
    openingPaymentsToday
      .filter((p) => p.mode === "Cash")
      .reduce((s, p) => s + Number(p.amount), 0);
  const upiIn =
    pays.filter((p) => p.mode === "UPI").reduce((s, p) => s + Number(p.amount), 0) +
    openingPaymentsToday
      .filter((p) => p.mode === "UPI")
      .reduce((s, p) => s + Number(p.amount), 0);
  const cjIn =
    pays.filter((p) => p.mode === "CJ").reduce((s, p) => s + Number(p.amount), 0) +
    openingPaymentsToday
      .filter((p) => p.mode === "CJ")
      .reduce((s, p) => s + Number(p.amount), 0);

  function statsFor(loc: "MS" | "NM") {
    const bs = bills.filter((b) => b.loc === loc);
    const ps = pays.filter(
      (p) => (p.billLoc === "NM" ? "NM" : "MS") === loc,
    );
    const op = openingPaymentsToday.filter(
      (p) => (p.loc === "NM" ? "NM" : "MS") === loc,
    );
    const ex = expenses.filter(
      (e) => (e.loc === "NM" ? "NM" : "MS") === loc,
    );
    const sumPay = (m: "Cash" | "UPI" | "CJ") =>
      ps.filter((p) => p.mode === m).reduce((s, p) => s + Number(p.amount), 0) +
      op.filter((p) => p.mode === m).reduce((s, p) => s + Number(p.amount), 0);
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
  const pattiPaidByMode = new Map(
    pattiPaidTodayByMode.map((r) => [r.mode, Number(r.s)]),
  );
  const pattiPaidCash = pattiPaidByMode.get("Cash") ?? 0;
  const pattiPaidUpi = pattiPaidByMode.get("UPI") ?? 0;
  // CJ paying a supplier directly on our behalf — reduces CJ's held balance,
  // never touches our own Cash/Bank.
  const pattiPaidCJ = pattiPaidByMode.get("CJ") ?? 0;
  const cjOpening =
    Number(settings.cjOpening ?? 0) +
    Number(cjReceivedBeforeRow?.s ?? 0) -
    Number(cjSettlementsBeforeRow?.s ?? 0) -
    Number(pattiPaidCJBeforeRow?.s ?? 0);
  const sales = bills.reduce((s, b) => s + b.total, 0);
  const credit = bills.reduce((s, b) => s + b.balance, 0);
  const profit = isOwner ? bills.reduce((s, b) => s + (b.profit ?? 0), 0) : 0;
  const depositTotal = depositsToday.reduce((s, d) => s + Number(d.amount), 0);
  const bookCashClose =
    openCash + cashIn + cjSettledCash - cashOut - pattiPaidCash - depositTotal;
  const bookBankClose =
    openBank + upiIn + cjSettledUpi - upiOut - pattiPaidUpi + depositTotal;

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
            After entering all bills and expenses for {fmtDate(date)}, count your cash and (if you
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
          <LedgerTAccount
            debits={[
              { label: "To Opening balance b/d", amount: openCash },
              { label: "To Cash received", amount: cashIn },
              { label: "To From CJ (settled)", amount: cjSettledCash },
            ]}
            credits={[
              { label: "By Cash expenses", amount: cashOut },
              ...(isOwner
                ? [{ label: "By Purchases paid (cash)", amount: pattiPaidCash }]
                : []),
              { label: "By Deposited to bank", amount: depositTotal },
              { label: "By Closing balance c/d", amount: bookCashClose },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank / UPI</CardTitle>
        </CardHeader>
        <CardContent>
          <LedgerTAccount
            debits={[
              { label: "To Opening balance b/d", amount: openBank },
              { label: "To UPI received", amount: upiIn },
              { label: "To From CJ (settled)", amount: cjSettledUpi },
              { label: "To Cash deposited", amount: depositTotal },
            ]}
            credits={[
              { label: "By UPI expenses", amount: upiOut },
              ...(isOwner
                ? [{ label: "By Purchases paid (UPI)", amount: pattiPaidUpi }]
                : []),
              { label: "By Closing balance c/d", amount: bookBankClose },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CJ (money held by CJ)</CardTitle>
        </CardHeader>
        <CardContent>
          <LedgerTAccount
            debits={[
              { label: "To Opening balance b/d", amount: cjOpening },
              { label: "To Received via CJ", amount: cjIn },
            ]}
            credits={[
              { label: "By CJ paid you", amount: cjSettledCash + cjSettledUpi },
              ...(isOwner
                ? [{ label: "By Paid to supplier via CJ", amount: pattiPaidCJ }]
                : []),
              {
                label: "By Closing balance c/d",
                amount: cjOpening + cjIn - cjSettledCash - cjSettledUpi - pattiPaidCJ,
              },
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
          {pays.length === 0 && openingPaymentsToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">No money received on this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Applied to</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Mode</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-4">Note</th>
                    {canEditClosing && <th className="py-2 pr-0" />}
                  </tr>
                </thead>
                <tbody>
                  {pays.map((p) => (
                    <tr key={`p-${p.id}`} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">
                        Bill {pad2(p.billNo)}
                      </td>
                      <td className="py-2 pr-4">{p.customer}</td>
                      <td className="py-2 pr-4">{p.mode}</td>
                      <td className="py-2 pr-4 text-right">{money(p.amount)}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {p.note || "—"}
                      </td>
                      {canEditClosing && (
                        <td className="py-2 pr-0 text-right">
                          <DeleteReceiptButton
                            id={p.id}
                            kind="bill"
                            label={`Bill ${pad2(p.billNo)} · ${p.customer}`}
                            amount={p.amount}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                  {openingPaymentsToday.map((p) => {
                    // Opening-payments cover two cases:
                    //   1. Real receipt against a pre-app old due (dueAmount > 0,
                    //      note usually blank or user-provided).
                    //   2. Overpayment cascade — the parent opening_due was created
                    //      with amount=0 and note="Advance received".
                    const isAdvance =
                      Number(p.dueAmount ?? 0) === 0 ||
                      (p.dueNote ?? "").toLowerCase().includes("advance");
                    return (
                      <tr key={`op-${p.id}`} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-muted-foreground">
                          {isAdvance ? "Advance" : "Old due"}
                        </td>
                        <td className="py-2 pr-4">{p.customer}</td>
                        <td className="py-2 pr-4">{p.mode}</td>
                        <td className="py-2 pr-4 text-right">{money(p.amount)}</td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {p.note || "—"}
                        </td>
                        {canEditClosing && (
                          <td className="py-2 pr-0 text-right">
                            <DeleteReceiptButton
                              id={p.id}
                              kind="opening"
                              label={`${isAdvance ? "Advance" : "Old due"} · ${p.customer}`}
                              amount={p.amount}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
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

      <Card>
        <CardHeader>
          <CardTitle>Cash deposits</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cash physically deposited into the bank on {fmtDate(date)}.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <CashDepositDialog mode="add" />
          {depositsToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cash deposits on this date.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-4">Note</th>
                    {canEditClosing && <th className="py-2 pr-0" />}
                  </tr>
                </thead>
                <tbody>
                  {depositsToday.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-right">{money(d.amount)}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {d.note || "—"}
                      </td>
                      {canEditClosing && (
                        <td className="py-2 pr-0 text-right">
                          <div className="flex gap-1 justify-end flex-wrap">
                            <CashDepositDialog
                              mode="edit"
                              id={d.id}
                              initialDate={d.date}
                              initialAmount={Number(d.amount)}
                              initialNote={d.note ?? ""}
                            />
                            <DeleteCashDepositButton id={d.id} amount={d.amount} />
                          </div>
                        </td>
                      )}
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
                        <td className="py-2 pr-4 font-mono">{pad2(p.pattiNo)}</td>
                        <td className="py-2 pr-4">{p.party}</td>
                        <td className="py-2 pr-4">{p.mode}</td>
                        <td className="py-2 pr-4 text-right">{money(p.amount)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-2 pr-4">Total</td>
                      <td />
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        Cash {money(pattiPaidCash)} · UPI {money(pattiPaidUpi)} · CJ{" "}
                        {money(pattiPaidCJ)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {money(pattiPaidCash + pattiPaidUpi + pattiPaidCJ)}
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
