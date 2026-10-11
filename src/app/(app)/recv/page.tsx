import { Wallet, Trash2, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth-helpers";
import { ExcelButton } from "@/components/excel-button";
import { getOldDues, getOldDuesSummary } from "@/lib/queries-recv";
import { getCustomerNames } from "@/lib/queries";
import { money } from "@/lib/format";
import { SumGrid } from "@/components/sum-grid";
import { AddOldDueForm } from "./add-old-due-form";
import { ReceiveDueDialog } from "./receive-due-dialog";
import { EditDueDialog } from "./edit-due-dialog";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { deleteOldDue } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReceivablesPage() {
  const session = await requireSession();
  const role = session.user.role;
  const isPrivileged = role === "owner" || role === "editor";

  const [dues, summary, custs] = await Promise.all([
    getOldDues(),
    getOldDuesSummary(),
    getCustomerNames(),
  ]);

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
          <CardTitle>Old dues</CardTitle>
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
            <p className="text-sm text-muted-foreground">No old dues entered yet.</p>
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
                      <td className="py-2 pr-4">{d.date}</td>
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
                              <ConfirmDestructive
                                title={`Delete old due for ${d.customer}?`}
                                description="This also removes any payments recorded against it."
                                confirmLabel="Delete due"
                                successMessage="Old due deleted"
                                onConfirm={() => deleteOldDue({ id: d.id })}
                                trigger={
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                }
                              />
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
