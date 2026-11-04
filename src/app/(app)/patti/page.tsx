import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth-helpers";
import { ExcelButton } from "@/components/excel-button";
import {
  getPattiBillsForMonth,
  getPattiPaymentsFor,
  getPattiLotNameSuggestions,
  getPattiPaidMap,
} from "@/lib/queries-patti";
import {
  customerKey,
  getBillsByDate,
  getCustomerBalances,
  getLotsWithStock,
} from "@/lib/queries";
import { getCurrentLoc, locLabel } from "@/lib/loc";
import { fmtDate, money, pad2, today } from "@/lib/format";
import { DateFilter } from "@/components/date-filter";
import { MonthPicker } from "../gstp/month-picker";
import { PattiPaymentsDialog, type PattiPayment } from "./patti-payments-dialog";
import { PattiForm } from "./patti-form";
import { SalePattiForm } from "./sale-patti-form";
import { PattiTabs } from "./patti-tabs";
import { PayPattiDialog } from "../patti-payments/pay-patti-dialog";
import { DeletePattiButton } from "./delete-patti-button";
import { BillRowActions } from "../bills/bill-row-actions";
import { EditSalePattiDialog } from "./edit-sale-patti-dialog";
import { EditPattiDialog } from "./edit-patti-dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ d?: string; m?: string }> };

export default async function PattiPage({ searchParams }: Props) {
  // Staff can open this page, create pattis and record payments; editing and
  // deleting a patti stays with owner and editor.
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const canEdit = isOwner || session.user.role === "editor";
  const sp = await searchParams;
  // Purchase pattis are listed by month; sale pattis by date.
  const date = sp.d || today();
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today().slice(0, 7);
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const loc = await getCurrentLoc();
  const [bills, lotSuggestions, lots, customerBalances, dayBills] =
    await Promise.all([
      getPattiBillsForMonth(month, loc),
      getPattiLotNameSuggestions(),
      getLotsWithStock(),
      getCustomerBalances(loc),
      getBillsByDate(date, isOwner, loc),
    ]);
  const saleBills = dayBills.filter((b) => b.kind === "psale");
  const [paidMap, payRows] = await Promise.all([
    getPattiPaidMap(bills.map((b) => b.id)),
    getPattiPaymentsFor(bills.map((b) => b.id)),
  ]);
  const paymentsOf = new Map<string, PattiPayment[]>();
  for (const p of payRows) {
    const list = paymentsOf.get(p.pattiId) ?? [];
    list.push({ id: p.id, date: p.date, mode: p.mode, amount: p.amount, note: p.note });
    paymentsOf.set(p.pattiId, list);
  }

  const total = bills.reduce((s, b) => s + Number(b.net), 0);
  const unpaid = bills.reduce((s, b) => {
    const paid = paidMap.get(b.id) ?? 0;
    return s + Math.max(0, Number(b.net) - paid);
  }, 0);

  // Sale patti form only shows lots that have stock at the Working-at store.
  const saleLots = lots
    .map((l) => ({
      id: l.id,
      name: l.name,
      left: loc === "NM" ? l.stkN : l.stkM,
    }))
    .filter((l) => l.left > 0);
  const customerNames = Array.from(
    new Set(customerBalances.map((c) => c.name)),
  ).sort();
  void customerKey;

  return (
    <div className="space-y-6">
      <PattiTabs
        purchase={
          <PattiForm
            key={loc}
            lotNameSuggestions={lotSuggestions}
            lots={lots.map((l) => ({ id: l.id, name: l.name }))}
            loc={loc}
          />
        }
        sale={<SalePattiForm key={loc} lots={saleLots} customers={customerNames} loc={loc} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {locLabel(loc)} patti bills in {monthLabel}
          </CardTitle>
          <CardDescription>
            {bills.length} bill{bills.length === 1 ? "" : "s"} · Total net: <b>{money(total)}</b> ·
            Not paid: <b>{money(unpaid)}</b>
          </CardDescription>
          <CardAction>
            <MonthPicker value={month} />
            <ExcelButton report="patti" date={`${month}-01`} label="Excel" />
          </CardAction>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No patti bills in {monthLabel}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">No.</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Seller</th>
                    <th className="py-2 pr-4">Lot</th>
                    <th className="py-2 pr-4 text-right">Bags</th>
                    <th className="py-2 pr-4 text-right">Kg</th>
                    <th className="py-2 pr-4 text-right">Rate</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-4 text-right">Net</th>
                    <th className="py-2 pr-4">Paid</th>
                    <th className="py-2 pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => {
                    const paid = paidMap.get(b.id) ?? 0;
                    const balance = Math.max(0, Number(b.net) - paid);
                    return (
                      <tr key={b.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-mono">{pad2(b.no)}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(b.date)}</td>
                        <td className="py-2 pr-4">{b.party}</td>
                        <td className="py-2 pr-4">{b.lotName ?? ""}</td>
                        <td className="py-2 pr-4 text-right">{b.bags}</td>
                        <td className="py-2 pr-4 text-right">{Number(b.kg)}</td>
                        <td className="py-2 pr-4 text-right">{money(b.rate)}</td>
                        <td className="py-2 pr-4 text-right">{money(b.amount)}</td>
                        <td className="py-2 pr-4 text-right font-semibold">
                          {money(b.net)}
                        </td>
                        <td className="py-2 pr-4">
                          {balance <= 0.5 ? (
                            <Badge
                              variant="outline"
                              className="text-xs border-success/40 text-success bg-success/10"
                            >
                              Paid
                              {b.paidDate ? ` · ${fmtDate(b.paidDate)}` : ""}
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
                          <div className="flex gap-1 justify-end items-center">
                            <Link href={`/patti/${b.id}/print`} target="_blank">
                              <Button type="button" size="icon-sm" variant="outline" title="Print">
                                <Printer className="h-4 w-4" />
                                <span className="sr-only">Print patti {pad2(b.no)}</span>
                              </Button>
                            </Link>
                            {canEdit && (
                              <EditPattiDialog
                                pattiId={b.id}
                                pattiNo={b.no}
                                lotNameSuggestions={lotSuggestions}
                              />
                            )}
                            {/* Pay while something is owed; once paid, Payments holds edit / undo. */}
                            {balance > 0.5 && (
                              <PayPattiDialog
                                pattiId={b.id}
                                party={b.party}
                                net={Number(b.net)}
                                paid={paid}
                              />
                            )}
                            {(paymentsOf.get(b.id)?.length ?? 0) > 0 && (
                              <PattiPaymentsDialog
                                pattiNo={b.no}
                                party={b.party}
                                net={Number(b.net)}
                                payments={paymentsOf.get(b.id)!}
                                canEdit={canEdit}
                              />
                            )}
                            {canEdit && <DeletePattiButton id={b.id} />}
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
          <CardTitle>Sale pattis on {fmtDate(date)}</CardTitle>
          <CardDescription>
            Sales recorded as patti bills (shown as <span className="font-mono">P NN</span>).
            Stock is deducted from the chosen lot; the buyer owes the net.
          </CardDescription>
          <CardAction>
            <DateFilter paramKey="d" value={date} />
          </CardAction>
        </CardHeader>
        <CardContent>
          {saleBills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sale pattis on this date.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">No.</th>
                    <th className="py-2 pr-4">Buyer</th>
                    <th className="py-2 pr-4 text-right">Net</th>
                    <th className="py-2 pr-4 text-right">Balance</th>
                    <th className="py-2 pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {saleBills.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">P {pad2(b.no)}</td>
                      <td className="py-2 pr-4">{b.customer}</td>
                      <td className="py-2 pr-4 text-right font-semibold">
                        {money(b.total)}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right ${b.balance > 0.5 ? "text-destructive" : ""}`}
                      >
                        {money(b.balance)}
                      </td>
                      <td className="py-2 pr-0 text-right">
                        <div className="flex gap-1 justify-end items-center">
                          {canEdit && (
                            <EditSalePattiDialog
                              billId={b.id}
                              billNo={b.no}
                              lots={saleLots}
                            />
                          )}
                          <BillRowActions
                            billId={b.id}
                            billNo={b.no}
                            balance={b.balance}
                            labelPrefix="P "
                            noun="sale patti"
                            canDelete={canEdit}
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
