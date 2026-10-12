import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth-helpers";
import {
  customerKey,
  getCustomerBalances,
  getPendingBillsByCustomer,
} from "@/lib/queries";
import { BackupButtons } from "./backup-buttons";
import { BalancesTable } from "./balances-table";
import { ExcelButton } from "@/components/excel-button";

export const dynamic = "force-dynamic";

export default async function BalancesPage() {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const [all, pending] = await Promise.all([
    getCustomerBalances(),
    getPendingBillsByCustomer(),
  ]);

  const rows = all.map((c) => ({
    name: c.name,
    openingDue: c.openingDue,
    openingPaid: c.openingPaid,
    billed: c.billed,
    paid: c.paid,
    totalBalance: c.totalBalance,
    pending: pending.get(customerKey(c.name)) ?? [],
  }));

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
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No customers yet. Rows appear here as soon as you create a bill or
              add an old due in Receivables.
            </p>
          ) : (
            <BalancesTable rows={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
