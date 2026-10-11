import Link from "next/link";
import { asc } from "drizzle-orm";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth-helpers";
import { db, schema } from "@/db";
import { getLotsWithStock } from "@/lib/queries";
import { GstBillForm } from "./gst-bill-form";
import { ExcelButton } from "@/components/excel-button";
import type { GstProfile } from "@/lib/gst-types";

export const dynamic = "force-dynamic";

export default async function GstBillPage() {
  await requireSession();
  const [customers, settingsRow, lots] = await Promise.all([
    db
      .select()
      .from(schema.gstCustomers)
      .orderBy(asc(schema.gstCustomers.name)),
    db.query.settings.findFirst(),
    getLotsWithStock(),
  ]);
  const profile = (settingsRow?.gstProfile ?? null) as GstProfile | null;

  if (!profile?.name || !profile?.stateCode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Fill your firm GST profile first
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            To create GST invoices, the owner must first fill the firm&apos;s GST details
            (name, GSTIN, state code).
          </p>
          <Link href="/gcust" className="text-sm underline">
            Go to GST customers → firm details →
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (customers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Add a GST customer first</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>GST invoices need a buyer from the GST customer portfolio.</p>
          <Link href="/gcust" className="underline">
            Go to GST customers →
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (lots.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Add a lot first</CardTitle>
        </CardHeader>
        <CardContent>
          <Link href="/lots" className="text-sm underline">
            Go to Lots →
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <GstBillForm
        profile={profile}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          state: c.state,
          stateCode: c.stateCode,
          gstin: c.gstin,
          address: c.address,
        }))}
        lots={lots.map((l) => ({ id: l.id, name: l.name, left: l.stkM }))}
      />
      <Card>
        <CardHeader>
          <CardTitle>Download GST invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <ExcelButton report="gst" pickDate label="GST bills (Excel)" />
        </CardContent>
      </Card>
    </div>
  );
}
