import { requireSession } from "@/lib/auth-helpers";
import { getCustomerNames, getLotCosts, getLotsWithStock, getSettings } from "@/lib/queries";
import { BillForm } from "./bill-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewBillPage() {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";

  const [lots, settings, customers, costs] = await Promise.all([
    getLotsWithStock(),
    getSettings(),
    getCustomerNames(),
    isOwner ? getLotCosts() : Promise.resolve({} as Record<string, string>),
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

  return (
    <BillForm
      lots={lots}
      hamaliDefault={Number(settings.hamaliDefault)}
      customers={customers}
      lotCosts={isOwner ? costs : null}
    />
  );
}
