import { eq, and } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { ExcelButton } from "@/components/excel-button";
import {
  getPattiBillsByDate,
  getPattiLotNameSuggestions,
  getPattiPaidMap,
} from "@/lib/queries-patti";
import {
  customerKey,
  getCustomerBalances,
  getLotsWithStock,
} from "@/lib/queries";
import { getCurrentLoc } from "@/lib/loc";
import { db, schema } from "@/db";
import { money, pad2, today } from "@/lib/format";
import { DateFilter } from "@/components/date-filter";
import { PattiForm } from "./patti-form";
import { SalePattiForm } from "./sale-patti-form";
import { PattiTabs } from "./patti-tabs";
import { PayPattiDialog } from "../patti-payments/pay-patti-dialog";
import { DeletePattiButton } from "./delete-patti-button";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ d?: string }> };

export default async function PattiPage({ searchParams }: Props) {
  await requireOwnerOrEditor();
  const sp = await searchParams;
  const date = sp.d || today();
  const [bills, lotSuggestions, lots, customerBalances, loc, saleBills] =
    await Promise.all([
      getPattiBillsByDate(date),
      getPattiLotNameSuggestions(),
      getLotsWithStock(),
      getCustomerBalances(),
      getCurrentLoc(),
      db
        .select()
        .from(schema.bills)
        .where(and(eq(schema.bills.kind, "psale"), eq(schema.bills.date, date))),
    ]);
  const paidMap = await getPattiPaidMap(bills.map((b) => b.id));

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
            lotNameSuggestions={lotSuggestions}
            lots={lots.map((l) => ({ id: l.id, name: l.name }))}
          />
        }
        sale={<SalePattiForm lots={saleLots} customers={customerNames} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Patti bills on this date</CardTitle>
          <DateFilter paramKey="d" value={date} />
          <ExcelButton report="patti" date={date} />
          <p className="text-sm text-muted-foreground">
            Total net: <b>{money(total)}</b> · Not paid: <b>{money(unpaid)}</b>
          </p>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No patti bills on this date.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">No.</th>
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
                              {b.paidDate ? ` · ${b.paidDate}` : ""}
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
                              pattiId={b.id}
                              party={b.party}
                              net={Number(b.net)}
                              paid={paid}
                            />
                            <DeletePattiButton id={b.id} />
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
          <CardTitle>Sale pattis on this date</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sales recorded as patti bills (shown as <span className="font-mono">P NN</span>).
            Stock is deducted from the chosen lot; the buyer owes the net.
          </p>
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
