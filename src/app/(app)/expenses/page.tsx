import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth-helpers";
import { ExcelButton } from "@/components/excel-button";
import { getExpensesByDate } from "@/lib/queries";
import { getCurrentLoc, locLabel } from "@/lib/loc";
import { money, today } from "@/lib/format";
import { DateFilter } from "@/components/date-filter";
import { ExpenseForm } from "./expense-form";
import { DeleteExpenseButton } from "./delete-expense-button";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ d?: string }> };

export default async function ExpensesPage({ searchParams }: Props) {
  await requireSession();
  const sp = await searchParams;
  const date = sp.d || today();
  const loc = await getCurrentLoc();
  const storeName = locLabel(loc);
  const rows = await getExpensesByDate(date, loc);
  const totalCash = rows
    .filter((e) => e.mode === "Cash")
    .reduce((s, e) => s + Number(e.amount), 0);
  const totalUpi = rows
    .filter((e) => e.mode === "UPI")
    .reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add expense · {storeName}</CardTitle>
        </CardHeader>
        <CardContent>
          <ExpenseForm defaultDate={date} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{storeName} expenses on this date</CardTitle>
          <ExcelButton report="expenses" date={date} />
        </CardHeader>
        <CardContent>
          <DateFilter paramKey="d" value={date} />
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Note</th>
                  <th className="py-2 pr-4">Paid by</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-0" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-2 text-muted-foreground">
                      No expenses on this date.
                    </td>
                  </tr>
                ) : (
                  rows.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{e.category}</td>
                      <td className="py-2 pr-4">{e.note ?? ""}</td>
                      <td className="py-2 pr-4">{e.mode}</td>
                      <td className="py-2 pr-4 text-right">{money(e.amount)}</td>
                      <td className="py-2 pr-0 text-right">
                        <DeleteExpenseButton id={e.id} />
                      </td>
                    </tr>
                  ))
                )}
                {rows.length > 0 && (
                  <tr>
                    <td className="py-2 pr-4 font-semibold">Total</td>
                    <td colSpan={2} className="py-2 pr-4 text-muted-foreground text-right">
                      Cash {money(totalCash)} · UPI {money(totalUpi)}
                    </td>
                    <td className="py-2 pr-4 text-right font-semibold">
                      {money(totalCash + totalUpi)}
                    </td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
