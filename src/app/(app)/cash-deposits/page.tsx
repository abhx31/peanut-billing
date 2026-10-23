import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { getAllCashDeposits } from "@/lib/queries";
import { fmtDate, money } from "@/lib/format";
import { CashDepositDialog } from "./cash-deposit-dialog";
import { DeleteCashDepositButton } from "./delete-cash-deposit-button";

export const dynamic = "force-dynamic";

export default async function CashDepositsPage() {
  await requireOwnerOrEditor();
  const deposits = await getAllCashDeposits();
  const total = deposits.reduce((s, d) => s + Number(d.amount), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cash deposits</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every time cash in hand gets physically deposited into the bank, record it
            here — it moves the amount out of Cash and into Bank / UPI in the Daily
            ledger from that date onward.
          </p>
        </CardHeader>
        <CardContent>
          <CashDepositDialog mode="add" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All deposits</CardTitle>
          <p className="text-sm text-muted-foreground">
            Total deposited: <b>{money(total)}</b>
          </p>
        </CardHeader>
        <CardContent>
          {deposits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cash deposits recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-4">Note</th>
                    <th className="py-2 pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{fmtDate(d.date)}</td>
                      <td className="py-2 pr-4 text-right font-semibold">
                        {money(d.amount)}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {d.note || "—"}
                      </td>
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
