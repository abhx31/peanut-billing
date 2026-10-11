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

  // Pre-shape lots so the form only sees the store-relevant stock number.
  const storeLots = lots.map((l) => ({
    id: l.id,
    name: l.name,
    left: loc === "NM" ? l.stkN : l.stkM,
  }));

  return (
    <BillForm
      lots={storeLots}
      hamaliDefault={Number(settings.hamaliDefault)}
      customers={customerBalances.map((c) => ({ name: c.name, balance: c.balance }))}
      lotCosts={canSeeCost ? costs : null}
      loc={loc}
    />
  );
}
