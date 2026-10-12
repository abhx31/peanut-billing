import Link from "next/link";
import { FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import {
  getGstMonthlySummary,
  getGstPurchasesForMonth,
} from "@/lib/queries-patti";
import { getLotsWithStock, getSettings } from "@/lib/queries";
import { fyOf, money, pad2, r2, today } from "@/lib/format";
import { DateFilter } from "@/components/date-filter";
import { SumGrid } from "@/components/sum-grid";
import { GstPurchaseForm } from "./gst-purchase-form";
import { DeleteGstPurchaseButton } from "./delete-gst-purchase-button";
import type { GstProfile } from "@/lib/gst-types";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ m?: string }> };

export default async function GstPurchasePage({ searchParams }: Props) {
  await requireOwnerOrEditor();
  const sp = await searchParams;
  const month = sp.m || today().slice(0, 7); // YYYY-MM
  const [settingsRow, lots, purchases, summary] = await Promise.all([
    getSettings(),
    getLotsWithStock(),
    getGstPurchasesForMonth(month),
    getGstMonthlySummary(month),
  ]);
  const profile = (settingsRow.gstProfile ?? null) as GstProfile | null;

  if (!profile?.name || !profile?.stateCode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fill your firm GST profile first</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            To record GST purchases we need your firm&apos;s GSTIN state so we
            can decide CGST+SGST vs IGST on each supplier invoice.
          </p>
          <Link href="/gcust" className="underline">
            Go to GST customers → firm details →
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
        <CardContent className="text-sm">
          <Link href="/lots" className="underline">
            Go to Lots →
          </Link>
        </CardContent>
      </Card>
    );
  }

  const totalPurchases = purchases.reduce((s, p) => s + Number(p.net ?? 0), 0);
  const paid = purchases
    .filter((p) => p.paidMode)
    .reduce((s, p) => s + Number(p.net ?? 0), 0);
  const unpaid = totalPurchases - paid;

  return (
    <div className="space-y-6">
      <GstPurchaseForm
        lots={lots.map((l) => ({ id: l.id, name: l.name }))}
        firmStateCode={String(profile.stateCode ?? "")}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            GST summary · {month}
            <Badge variant="secondary">FY {fyOf(`${month}-01`)}</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Output tax (what you charged on GST sales invoices) minus Input
            Tax Credit (what suppliers charged you with ITC ticked). The three
            Net payable numbers go to the government after the month closes.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4" />
                  <th className="py-2 pr-4 text-right">Taxable</th>
                  <th className="py-2 pr-4 text-right">CGST</th>
                  <th className="py-2 pr-4 text-right">SGST</th>
                  <th className="py-2 pr-4 text-right">IGST</th>
                  <th className="py-2 pr-4 text-right">Total tax</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 pr-4">Output (GST sales)</td>
                  <td className="py-2 pr-4 text-right">{money(summary.outputTaxable)}</td>
                  <td className="py-2 pr-4 text-right">{money(summary.output.cgst)}</td>
                  <td className="py-2 pr-4 text-right">{money(summary.output.sgst)}</td>
                  <td className="py-2 pr-4 text-right">{money(summary.output.igst)}</td>
                  <td className="py-2 pr-4 text-right">
                    {money(
                      summary.output.cgst + summary.output.sgst + summary.output.igst,
                    )}
                  </td>
                </tr>
                <tr className="border-b text-success">
                  <td className="py-2 pr-4">ITC (GST purchases)</td>
                  <td className="py-2 pr-4 text-right">{money(summary.inputTaxable)}</td>
                  <td className="py-2 pr-4 text-right">−{money(summary.itc.cgst)}</td>
                  <td className="py-2 pr-4 text-right">−{money(summary.itc.sgst)}</td>
                  <td className="py-2 pr-4 text-right">−{money(summary.itc.igst)}</td>
                  <td className="py-2 pr-4 text-right">
                    −{money(summary.itc.cgst + summary.itc.sgst + summary.itc.igst)}
                  </td>
                </tr>
                <tr className="font-semibold">
                  <td className="py-2 pr-4">Net payable</td>
                  <td />
                  <td className="py-2 pr-4 text-right">
                    {money(summary.netPayable.cgst)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {money(summary.netPayable.sgst)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {money(summary.netPayable.igst)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {money(
                      summary.netPayable.cgst +
                        summary.netPayable.sgst +
                        summary.netPayable.igst,
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-primary" />
            GST purchases this month
          </CardTitle>
          <div className="flex items-end gap-3 flex-wrap">
            <DateFilter paramKey="m" value={`${month}-01`} />
          </div>
        </CardHeader>
        <CardContent>
          <SumGrid
            items={[
              ["Purchases", String(purchases.length)],
              ["Taxable + tax", money(totalPurchases)],
              ["Paid", money(paid)],
              ["Not paid", money(unpaid)],
            ]}
          />
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4">GP no.</th>
                  <th className="py-2 pr-4">Supplier invoice</th>
                  <th className="py-2 pr-4">Supplier</th>
                  <th className="py-2 pr-4 text-right">Taxable</th>
                  <th className="py-2 pr-4 text-right">Tax / ITC</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                  <th className="py-2 pr-4">Paid</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {purchases.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-3 text-muted-foreground">
                      No GST purchases in {month}.
                    </td>
                  </tr>
                )}
                {purchases.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono">GP {pad2(p.no)}</td>
                    <td className="py-2 pr-4">
                      {p.invNo ? (
                        <>
                          <span className="font-mono">{p.invNo}</span>
                          {p.invDate ? ` · ${p.invDate}` : ""}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{p.party}</td>
                    <td className="py-2 pr-4 text-right">
                      {money(p.taxable ?? "0")}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {money(p.itc ?? "0")}
                      {p.itcOn === false && (
                        <span className="text-muted-foreground"> (no ITC)</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right">{money(p.net)}</td>
                    <td className="py-2 pr-4">
                      {p.paidMode ? (
                        <Badge
                          variant="outline"
                          className="text-xs border-success/40 text-success bg-success/10"
                        >
                          {p.paidMode}
                          {p.paidDate ? ` · ${p.paidDate}` : ""}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          Not paid
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-0 text-right">
                      <DeleteGstPurchaseButton id={p.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {/* r2 is unused in this file but imported from format for consistency */}
      <span className="hidden">{r2(0)}</span>
    </div>
  );
}
