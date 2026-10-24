import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth-helpers";
import { db, schema } from "@/db";
import { getGstBillsForMonth, getLotCosts, getLotsWithStock, lotStockAt } from "@/lib/queries";
import { getCurrentLoc, locLabel } from "@/lib/loc";
import { fmtDate, fyOf, money, pad2, r2, today } from "@/lib/format";
import { GstBillForm } from "./gst-bill-form";
import { ExcelButton } from "@/components/excel-button";
import { MonthPicker } from "../gstp/month-picker";
import { BillRowActions } from "../bills/bill-row-actions";
import { EditGstBillDialog } from "./edit-gst-bill-dialog";
import type { GstProfile } from "@/lib/gst-types";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ m?: string }> };

export default async function GstBillPage({ searchParams }: Props) {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const currentFy = fyOf(today());
  const sp = await searchParams;
  const month = sp.m || today().slice(0, 7);
  const loc = await getCurrentLoc();
  const [customers, settingsRow, lots, nextNoRow, lotCosts, monthBills] = await Promise.all([
    db
      .select()
      .from(schema.gstCustomers)
      .orderBy(asc(schema.gstCustomers.name)),
    db.query.settings.findFirst(),
    getLotsWithStock(),
    db
      .select({
        max: sql<number>`coalesce(max(${schema.bills.no}), 0)::int`,
      })
      .from(schema.bills)
      .where(and(eq(schema.bills.kind, "gst"), eq(schema.bills.fy, currentFy)))
      .then((r) => r[0]),
    isOwner ? getLotCosts() : Promise.resolve({} as Record<string, string>),
    getGstBillsForMonth(month, isOwner, loc),
  ]);
  const profile = (settingsRow?.gstProfile ?? null) as GstProfile | null;
  const nextInvoiceNo = Number(nextNoRow?.max ?? 0) + 1;
  // Allow a settings-level override: settings.gstProfile may embed a "nextNo" the user has set.
  const forcedNext = Number(
    (settingsRow?.gstProfile as { nextNo?: unknown } | null)?.nextNo ?? 0,
  );
  const invoiceNo = forcedNext > nextInvoiceNo ? forcedNext : nextInvoiceNo;

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
        lots={lots.map((l) => ({ id: l.id, name: l.name, left: lotStockAt(l, loc).left }))}
        nextInvoiceNo={invoiceNo}
        currentFy={currentFy}
        lotCosts={isOwner ? lotCosts : null}
      />
      <Card>
        <CardHeader>
          <CardTitle>Download GST invoices · {locLabel(loc)}</CardTitle>
        </CardHeader>
        <CardContent>
          <ExcelButton report="gst" pickDate label="GST bills (Excel)" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GST invoices · {locLabel(loc)}</CardTitle>
          <MonthPicker value={month} />
        </CardHeader>
        <CardContent>
          {monthBills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No GST invoices in this month.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">No.</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Buyer</th>
                    <th className="py-2 pr-4 text-right">Bags</th>
                    <th className="py-2 pr-4 text-right">Kg</th>
                    <th className="py-2 pr-4 text-right">Total</th>
                    <th className="py-2 pr-4 text-right">Balance</th>
                    <th className="py-2 pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {monthBills.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">GST {pad2(b.no)}</td>
                      <td className="py-2 pr-4">{fmtDate(b.date)}</td>
                      <td className="py-2 pr-4">{b.customer}</td>
                      <td className="py-2 pr-4 text-right">{b.bags}</td>
                      <td className="py-2 pr-4 text-right">{r2(b.kg)}</td>
                      <td className="py-2 pr-4 text-right font-semibold">
                        {money(b.total)}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right ${b.balance > 0.5 ? "text-destructive" : ""}`}
                      >
                        {money(b.balance)}
                      </td>
                      <td className="py-2 pr-0 text-right">
                        <div className="flex gap-1 justify-end flex-wrap">
                          <EditGstBillDialog
                            billId={b.id}
                            billNo={b.no}
                            lots={lots.map((l) => ({ id: l.id, name: l.name }))}
                          />
                          <BillRowActions
                            billId={b.id}
                            billNo={b.no}
                            balance={b.balance}
                            labelPrefix="GST "
                            noun="GST invoice"
                          />
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
