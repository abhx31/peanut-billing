import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cashBalanceBefore,
  getAllPaymentsOnDate,
  getBillsByDate,
  getExpensesByDate,
  getSettings,
} from "@/lib/queries";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth-helpers";
import { money, pad2, r2, today } from "@/lib/format";
import { DateFilter } from "@/components/date-filter";
import { SumGrid } from "@/components/sum-grid";
import { Button } from "@/components/ui/button";
import { OpeningBalanceButton } from "./opening-balance-button";
import { CloseDayCard } from "./close-day-card";
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

  const [bills, pays, expenses, settings, openCash, openBank, existingClosing] = await Promise.all([
    getBillsByDate(date, isOwner),
    getAllPaymentsOnDate(date),
    getExpensesByDate(date),
    getSettings(),
    cashBalanceBefore("Cash", date),
    cashBalanceBefore("UPI", date),
    db.query.closings.findFirst({ where: eq(schema.closings.date, date) }),
  ]);

  const cashIn = pays.filter((p) => p.mode === "Cash").reduce((s, p) => s + Number(p.amount), 0);
  const upiIn = pays.filter((p) => p.mode === "UPI").reduce((s, p) => s + Number(p.amount), 0);
  const cashOut = expenses
    .filter((e) => e.mode === "Cash")
    .reduce((s, e) => s + Number(e.amount), 0);
  const upiOut = expenses
    .filter((e) => e.mode === "UPI")
    .reduce((s, e) => s + Number(e.amount), 0);
  const sales = bills.reduce((s, b) => s + b.total, 0);
  const credit = bills.reduce((s, b) => s + b.balance, 0);
  const profit = isOwner ? bills.reduce((s, b) => s + (b.profit ?? 0), 0) : 0;
  const bookCashClose = openCash + cashIn - cashOut;
  const bookBankClose = openBank + upiIn - upiOut;

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
          <CardTitle>Cash in hand</CardTitle>
        </CardHeader>
        <CardContent>
          <SumGrid
            items={[
              ["Opening", money(openCash)],
              ["Cash received", money(cashIn)],
              ["Cash expenses", money(cashOut)],
              ["Closing", money(openCash + cashIn - cashOut)],
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
              ["UPI expenses", money(upiOut)],
              ["Closing", money(openBank + upiIn - upiOut)],
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
