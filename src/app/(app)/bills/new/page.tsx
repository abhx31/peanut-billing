import { requireSession } from "@/lib/auth-helpers";
import {
  getCustomerBalances,
  getLotCosts,
  getLotsWithStock,
  getSettings,
} from "@/lib/queries";
import { getCurrentLoc } from "@/lib/loc";
import { BillForm } from "./bill-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewBillPage() {
  const session = await requireSession();
  const role = session.user.role;
  const canSeeCost = role === "owner" || role === "editor";

  const [lots, settings, customerBalances, costs, loc] = await Promise.all([
    getLotsWithStock(),
    getSettings(),
    getCustomerBalances(),
    canSeeCost ? getLotCosts() : Promise.resolve({} as Record<string, string>),
    getCurrentLoc(),
  ]);

  if (lots.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Add a lot first</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            You need at least one lot (quality) in stock before you can create a bill.
          </p>
          <Link href="/lots" className="text-sm underline">
            Go to Lots & stock →
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Only show lots that have stock at the current store. The bill is tagged
  // server-side with whichever store the user is working at.
  const storeLots = lots
    .map((l) => ({
      id: l.id,
      name: l.name,
      left: loc === "NM" ? l.stkN : l.stkM,
    }))
    .filter((l) => l.left > 0);
  const storeName = loc === "NM" ? "New Mahavir" : "Main store";

  if (storeLots.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No stock at {storeName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            None of your lots have bags at <b>{storeName}</b>. Transfer stock in
            from the other store, add stock here, or switch the Working-at bar
            to the store that has stock.
          </p>
          <div className="flex gap-3">
            <Link href="/nm" className="underline">
              Open transfers →
            </Link>
            <Link href="/lots" className="underline">
              Add stock →
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <BillForm
      lots={storeLots}
      hamaliDefault={Number(settings.hamaliDefault)}
      customers={customerBalances.map((c) => ({
        name: c.name,
        balance: c.totalBalance,
      }))}
      lotCosts={canSeeCost ? costs : null}
      loc={loc}
    />
  );
}
