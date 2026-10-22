import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import {
  getGstMonthlySummary,
  getGstPurchasesForMonth,
  getPattiPaidMap,
} from "@/lib/queries-patti";
import { getLotsWithStock, getSettings } from "@/lib/queries";
import { db, schema } from "@/db";
import { fyOf, money, pad2, today } from "@/lib/format";
import { GstPurchaseForm } from "./gst-purchase-form";
import { DeleteGstPurchaseButton } from "./delete-gst-purchase-button";
import { PayPattiDialog } from "../patti-payments/pay-patti-dialog";
import { MonthPicker } from "./month-picker";
import type { GstProfile } from "@/lib/gst-types";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ m?: string }> };

export default async function GstPurchasePage({ searchParams }: Props) {
  await requireOwnerOrEditor();
  const sp = await searchParams;
  const month = sp.m || today().slice(0, 7); // YYYY-MM
  const currentFy = fyOf(today());

  const [settingsRow, lots, purchases, summary, nextNoRow] = await Promise.all([
    getSettings(),
    getLotsWithStock(),
    getGstPurchasesForMonth(month),
    getGstMonthlySummary(month),
    db
      .select({
        max: sql<number>`coalesce(max(${schema.pattiBills.no}), 0)::int`,
      })
      .from(schema.pattiBills)
      .where(
        and(
          eq(schema.pattiBills.kind, "gstp"),
          eq(schema.pattiBills.fy, currentFy),
        ),
      )
      .then((r) => r[0]),
  ]);
  const profile = (settingsRow.gstProfile ?? null) as GstProfile | null;
  const nextNo = Number(nextNoRow?.max ?? 0) + 1;
  const paidMap = await getPattiPaidMap(purchases.map((p) => p.id));

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
  const totalTaxable = purchases.reduce(
    (s, p) => s + Number(p.taxable ?? 0),
    0,
  );
  const totalItc = purchases.reduce((s, p) => s + Number(p.itc ?? 0), 0);
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="space-y-6">
      <GstPurchaseForm
        lots={lots.map((l) => ({ id: l.id, name: l.name }))}
        firmStateCode={String(profile.stateCode ?? "")}
        nextNo={nextNo}
        currentFy={currentFy}
      />

      <Card>
        <CardHeader>
          <CardTitle>GST purchases in {monthLabel}</CardTitle>
          <MonthPicker value={month} />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Tile label="Purchases" value={String(purchases.length)} />
            <Tile label="Taxable value" value={money(totalTaxable)} />
            <Tile label="Total payable" value={money(totalPurchases)} />
            <Tile label="Tax I can claim back" value={money(totalItc)} />
          </div>

          {purchases.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No GST purchases in this month.
            </p>
          ) : (
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
                  {purchases.map((p) => {
                    const paid = paidMap.get(p.id) ?? 0;
                    const balance = Math.max(0, Number(p.net) - paid);
                    return (
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
                          {balance <= 0.5 ? (
                            <Badge
                              variant="outline"
                              className="text-xs border-success/40 text-success bg-success/10"
                            >
                              Paid
                              {p.paidDate ? ` · ${p.paidDate}` : ""}
                            </Badge>
                          ) : paid > 0.5 ? (
                            <Badge variant="outline" className="text-xs">
                              {money(paid)} paid · {money(balance)} owed
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              Not paid
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 pr-0 text-right">
                          <div className="flex gap-1 justify-end flex-wrap">
                            <PayPattiDialog
                              pattiId={p.id}
                              party={p.party}
                              net={Number(p.net)}
                              paid={paid}
                            />
                            <DeleteGstPurchaseButton id={p.id} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GST summary: tax on sales vs tax I can claim back</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4">Tax</th>
                  <th className="py-2 pr-4 text-right">On my sales</th>
                  <th className="py-2 pr-4 text-right">I can claim back</th>
                  <th className="py-2 pr-4 text-right">Net payable</th>
                </tr>
              </thead>
              <tbody>
                <SummaryRow
                  label="CGST"
                  sale={summary.output.cgst}
                  itc={summary.itc.cgst}
                />
                <SummaryRow
                  label="SGST"
                  sale={summary.output.sgst}
                  itc={summary.itc.sgst}
                />
                <SummaryRow
                  label="IGST"
                  sale={summary.output.igst}
                  itc={summary.itc.igst}
                />
                <tr className="font-semibold">
                  <td className="py-2 pr-4">Total</td>
                  <td className="py-2 pr-4 text-right">
                    {money(
                      summary.output.cgst + summary.output.sgst + summary.output.igst,
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {money(summary.itc.cgst + summary.itc.sgst + summary.itc.igst)}
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
          <p className="mt-3 text-xs text-muted-foreground">
            An indicative figure from this app for the month above. Your CA
            files the returns.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg tabular-nums font-semibold">{value}</div>
    </div>
  );
}

function SummaryRow({
  label,
  sale,
  itc,
}: {
  label: string;
  sale: number;
  itc: number;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4">{label}</td>
      <td className="py-2 pr-4 text-right">{money(sale)}</td>
      <td className="py-2 pr-4 text-right">{money(itc)}</td>
      <td className="py-2 pr-4 text-right">{money(sale - itc)}</td>
    </tr>
  );
}
