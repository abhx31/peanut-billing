import { ArrowLeftRight, Boxes } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth-helpers";
import { getLatestTransfers } from "@/lib/queries-nm";
import { getLotsWithStock } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import { stockLocShort } from "@/lib/stock-loc";
import { TransferForm } from "./transfer-form";
import { DeleteTransferButton } from "./delete-transfer-button";

export const dynamic = "force-dynamic";

// Bag transfers are the one link between the two stores and Cold storage, so
// this page is the same whichever store is selected. Cold storage exists only
// here: it holds bags and nothing else (no bills, cash or ledger). Each store's
// own stock and sales live on the Stock / Daily summary pages.
export default async function BagTransfersPage() {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const isPrivileged = isOwner || session.user.role === "editor";

  const [lots, transfers] = await Promise.all([getLotsWithStock(), getLatestTransfers(30)]);
  const stocked = lots.filter((l) => l.stkM !== 0 || l.stkN !== 0 || l.stkC !== 0);
  const sum = (f: (l: (typeof lots)[number]) => number) => stocked.reduce((s, l) => s + f(l), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            Transfer bags
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Move bags between the Main store, New Mahavir and Cold storage. These moves
            update the stock at each place but never change what&apos;s been sold.
          </p>
        </CardHeader>
        <CardContent>
          <TransferForm lots={lots} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary" />
            Stock at each place
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stocked.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bags in stock.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Lot</th>
                    <th className="py-2 pr-4 text-right">Main store</th>
                    <th className="py-2 pr-4 text-right">New Mahavir</th>
                    <th className="py-2 pr-4 text-right">Cold storage</th>
                    <th className="py-2 pr-0 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stocked.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{l.name}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{l.stkM}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{l.stkN}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{l.stkC}</td>
                      <td className="py-2 pr-0 text-right tabular-nums font-medium">
                        {l.stkM + l.stkN + l.stkC}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold border-t">
                    <td className="py-2 pr-4">Total bags</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{sum((l) => l.stkM)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{sum((l) => l.stkN)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{sum((l) => l.stkC)}</td>
                    <td className="py-2 pr-0 text-right tabular-nums">
                      {sum((l) => l.stkM + l.stkN + l.stkC)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transfers (latest 30)</CardTitle>
        </CardHeader>
        <CardContent>
          {transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transfers yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Lot</th>
                    <th className="py-2 pr-4 text-right">Bags</th>
                    <th className="py-2 pr-4">From → To</th>
                    <th className="py-2 pr-4">Note</th>
                    {isPrivileged && <th className="py-2 pr-0" />}
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{fmtDate(t.date)}</td>
                      <td className="py-2 pr-4">{t.lotName}</td>
                      <td className="py-2 pr-4 text-right">{t.bags}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {stockLocShort(t.fromLoc)} → {stockLocShort(t.toLoc)}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {t.note ?? ""}
                      </td>
                      {isPrivileged && (
                        <td className="py-2 pr-0 text-right">
                          <DeleteTransferButton id={t.id} />
                        </td>
                      )}
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
