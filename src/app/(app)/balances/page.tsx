import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth-helpers";
import { getCustomerBalances } from "@/lib/queries";
import { money } from "@/lib/format";
import { ReceiveFromCustomerButton } from "./receive-from-customer-button";
import { BackupButtons } from "./backup-buttons";
import { ExcelButton } from "@/components/excel-button";

export const dynamic = "force-dynamic";

export default async function BalancesPage() {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const all = await getCustomerBalances();
  const totalBilled = all.reduce((s, c) => s + c.billed, 0);
  const totalPaid = all.reduce((s, c) => s + c.paid, 0);
  const totalBalance = all.reduce((s, c) => s + c.balance, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap items-center">
            <ExcelButton report="balances" label="Balances (Excel)" />
            <BackupButtons isOwner={isOwner} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer balances (credit given)</CardTitle>
        </CardHeader>
        <CardContent>
          {all.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bills yet. Balances appear here when a customer has not paid in full.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4 text-right">Total billed</th>
                    <th className="py-2 pr-4 text-right">Paid</th>
                    <th className="py-2 pr-4 text-right">Balance</th>
                    <th className="py-2 pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {all.map((c) => (
                    <tr key={c.name} className="border-b last:border-0">
                      <td className="py-2 pr-4">{c.name}</td>
                      <td className="py-2 pr-4 text-right">{money(c.billed)}</td>
                      <td className="py-2 pr-4 text-right">{money(c.paid)}</td>
                      <td
                        className={`py-2 pr-4 text-right ${c.balance > 0.5 ? "text-destructive font-semibold" : ""}`}
                      >
                        {money(c.balance)}
                      </td>
                      <td className="py-2 pr-0 text-right">
                        {c.balance > 0.5 && (
                          <ReceiveFromCustomerButton
                            customer={c.name}
                            balance={c.balance}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-4">All customers</td>
                    <td className="py-2 pr-4 text-right">{money(totalBilled)}</td>
                    <td className="py-2 pr-4 text-right">{money(totalPaid)}</td>
                    <td className="py-2 pr-4 text-right">{money(totalBalance)}</td>
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
