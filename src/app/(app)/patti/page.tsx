import { ShoppingBasket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { ExcelButton } from "@/components/excel-button";
import { getPattiBillsByDate, getPattiLotNameSuggestions } from "@/lib/queries-patti";
import { money, pad2, today } from "@/lib/format";
import { DateFilter } from "@/components/date-filter";
import { PattiForm } from "./patti-form";
import { PattiMarkPaid } from "./patti-mark-paid";
import { DeletePattiButton } from "./delete-patti-button";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ d?: string }> };

export default async function PattiPage({ searchParams }: Props) {
  await requireOwnerOrEditor();
  const sp = await searchParams;
  const date = sp.d || today();
  const [bills, lotSuggestions] = await Promise.all([
    getPattiBillsByDate(date),
    getPattiLotNameSuggestions(),
  ]);

  const total = bills.reduce((s, b) => s + Number(b.net), 0);
  const unpaid = bills
    .filter((b) => !b.paidMode)
    .reduce((s, b) => s + Number(b.net), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBasket className="h-4 w-4 text-primary" />
            Patti bill (purchase / procurement)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Record what you buy from a farmer or seller. Deductions (CD / labour /
            transport) reduce the net; brokerage can either add to or deduct from the
            net depending on who&apos;s paying
            depending on who&apos;s paying. Patti payments move your cash/UPI ledger but
            never affect sales profit.
          </p>
        </CardHeader>
        <CardContent>
          <PattiForm lotNameSuggestions={lotSuggestions} />
        </CardContent>
      </Card>

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
                  {bills.map((b) => (
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
                        {b.paidMode ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-success/40 text-success bg-success/10"
                          >
                            {b.paidMode}
                            {b.paidDate ? ` · ${b.paidDate}` : ""}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            Not paid
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-0 text-right">
                        <div className="flex gap-1 justify-end flex-wrap">
                          <PattiMarkPaid
                            id={b.id}
                            party={b.party}
                            net={Number(b.net)}
                            paidMode={b.paidMode as "Cash" | "UPI" | null}
                          />
                          <DeletePattiButton id={b.id} />
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
