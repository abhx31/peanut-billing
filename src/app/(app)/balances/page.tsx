import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth-helpers";
import { getCustomerBalances } from "@/lib/queries";
import { BackupButtons } from "./backup-buttons";
import { BalancesTable } from "./balances-table";
import { ExcelButton } from "@/components/excel-button";

export const dynamic = "force-dynamic";

export default async function BalancesPage() {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const all = await getCustomerBalances();

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
            <BalancesTable rows={all} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
