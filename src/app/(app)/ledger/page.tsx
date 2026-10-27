import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCustomerBalances } from "@/lib/queries";
import { getLedgerDay } from "@/lib/ledger-day";
import { requireSession } from "@/lib/auth-helpers";
import { getCurrentLoc, locLabel, openingsFor } from "@/lib/loc";
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
  // Everything below is the current store's own book only.
  const loc = await getCurrentLoc();

  const [day, customerBalances] = await Promise.all([
    getLedgerDay(date, loc, isOwner),
    getCustomerBalances(loc),
  ]);
  const {
    settings,
    bills,
    pays,
    expenses,
    openingPayments: openingPaymentsToday,
    pattiPaidToday,
    depositsToday,
    existingClosing,
  } = day;

  const byMode = <T extends { mode: string; amount: string }>(rows: T[], mode: string) =>
    rows.filter((r) => r.mode === mode).reduce((s, r) => s + Number(r.amount), 0);
  const cashOut = byMode(expenses, "Cash");
  const upiOut = byMode(expenses, "UPI");
  const pattiPaidCash = byMode(pattiPaidToday, "Cash");
  const pattiPaidUpi = byMode(pattiPaidToday, "UPI");
  const pattiPaidCJ = byMode(pattiPaidToday, "CJ");
  const opening = openingsFor(settings, loc);
  const sales = bills.reduce((s, b) => s + b.total, 0);
  const credit = bills.reduce((s, b) => s + b.balance, 0);
  const profit = isOwner ? bills.reduce((s, b) => s + (b.profit ?? 0), 0) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Daily ledger · {locLabel(loc)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Only {locLabel(loc)}&apos;s bills, receipts, expenses and cash. Switch store at the top to
            see the other store&apos;s book.
          </p>
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
          <ExpenseQuickButton defaultDate={date} />
          {isOwner && (
            <OpeningBalanceButton
              storeName={locLabel(loc)}
              openingCash={opening.cash}
              openingBank={opening.bank}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Close the day</CardTitle>
          <p className="text-sm text-muted-foreground">
            After entering all of {locLabel(loc)}&apos;s bills and expenses for {fmtDate(date)},
            count this store&apos;s cash and (if you can) check its bank balance, then save it as
            the closing. Tomorrow&apos;s opening for {locLabel(loc)} uses this number.
          </p>
        </CardHeader>
        <CardContent>
          <CloseDayCard
            date={date}
            bookCash={day.cash.closing}
            bookBank={day.bank.closing}
            existingCash={existingClosing?.cash ?? null}
            existingBank={existingClosing?.bank ?? null}
            canEdit={canEditClosing}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cash in hand</CardTitle>
        </CardHeader>
        <CardContent>
          <LedgerTAccount debits={day.cash.debits} credits={day.cash.credits} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank / UPI</CardTitle>
        </CardHeader>
        <CardContent>
          <LedgerTAccount debits={day.bank.debits} credits={day.bank.credits} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CJ (money held by CJ)</CardTitle>
        </CardHeader>
        <CardContent>
          <LedgerTAccount debits={day.cj.debits} credits={day.cj.credits} />
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
                    const { isAdvance } = p;
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
