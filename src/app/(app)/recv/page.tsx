import { Wallet, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth-helpers";
import { ExcelButton } from "@/components/excel-button";
import { getOldDues, getOldDuesSummary } from "@/lib/queries-recv";
import { getCustomerNames } from "@/lib/queries";
import { fmtDate, money } from "@/lib/format";
import { SumGrid } from "@/components/sum-grid";
import { AddOldDueForm } from "./add-old-due-form";
import { ReceiveDueDialog } from "./receive-due-dialog";
import { EditDueDialog } from "./edit-due-dialog";
import { DeleteOldDueButton } from "./delete-old-due-button";

export const dynamic = "force-dynamic";

export default async function ReceivablesPage() {
  const session = await requireSession();
  const role = session.user.role;
  const isPrivileged = role === "owner" || role === "editor";

  const [allDues, summary, custs] = await Promise.all([
    getOldDues(),
    getOldDuesSummary(),
    getCustomerNames(),
  ]);
  // Hide fully-paid / overpaid dues (and the amount=0 "Advance received"
  // marker rows). Keep them in the summary tiles so totals still reflect
  // every row ever entered.
  const dues = allDues.filter((d) => d.due > 0.5);
  const hiddenCount = allDues.length - dues.length;

  return (
    <div className="space-y-6">
      {isPrivileged && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Old dues from before you started using the app
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Enter each customer&apos;s total due as of your start date. These are not new
              sales, so they do not change sales, profit, stock or hamali.
            </p>
          </CardHeader>
          <CardContent>
            <AddOldDueForm existingCustomers={custs} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 flex-wrap">
            Old dues
            {hiddenCount > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                ({hiddenCount} paid or advance {hiddenCount === 1 ? "entry" : "entries"} hidden — see Balances → Statement for the full history)
              </span>
            )}
          </CardTitle>
          <ExcelButton report="receivables" />
          <SumGrid
            items={[
              ["Old dues entered", money(summary.total)],
              ["Received so far", money(summary.paid)],
              ["Still due", money(summary.outstanding)],
              ["Customers", String(summary.customers)],
            ]}
          />
        </CardHeader>
        <CardContent>
          {dues.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {allDues.length === 0
                ? "No old dues entered yet."
                : "All old dues have been paid. Add a new one above to track more."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">As of</th>
                    <th className="py-2 pr-4 text-right">Old due</th>
                    <th className="py-2 pr-4 text-right">Received</th>
                    <th className="py-2 pr-4 text-right">Still due</th>
                    <th className="py-2 pr-4">Note</th>
                    <th className="py-2 pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {dues.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{d.customer}</td>
                      <td className="py-2 pr-4">{fmtDate(d.date)}</td>
                      <td className="py-2 pr-4 text-right">{money(d.amount)}</td>
                      <td className="py-2 pr-4 text-right">{money(d.paid)}</td>
                      <td
                        className={`py-2 pr-4 text-right ${d.due > 0.5 ? "text-destructive font-semibold" : ""}`}
                      >
                        {money(d.due)}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {d.note ?? ""}
                      </td>
                      <td className="py-2 pr-0 text-right">
                        <div className="flex gap-1 justify-end flex-wrap">
                          {d.due > 0.5 && (
                            <ReceiveDueDialog
                              id={d.id}
                              customer={d.customer}
                              due={d.due}
                            />
                          )}
                          {isPrivileged && (
                            <>
                              <EditDueDialog id={d.id} customer={d.customer} amount={d.amount} />
                              <DeleteOldDueButton id={d.id} customer={d.customer} />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-4">Total</td>
                    <td />
                    <td className="py-2 pr-4 text-right">{money(summary.total)}</td>
                    <td className="py-2 pr-4 text-right">{money(summary.paid)}</td>
                    <td className="py-2 pr-4 text-right">{money(summary.outstanding)}</td>
                    <td />
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Unused imports kept for clarity.
void Pencil;
