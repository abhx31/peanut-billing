import { ArrowLeftRight, ArrowRight, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth-helpers";
import { getLatestTransfers } from "@/lib/queries-nm";
import { getLotsWithStock } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import { TransferForm } from "./transfer-form";
import { DeleteTransferButton } from "./delete-transfer-button";

export const dynamic = "force-dynamic";

// Bag transfers are the one link between the two stores, so this page is the
// same whichever store is selected. Each store's own stock and sales live on
// the Stock / Daily summary pages while working at that store.
export default async function BagTransfersPage() {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const isPrivileged = isOwner || session.user.role === "editor";

  const [lots, transfers] = await Promise.all([getLotsWithStock(), getLatestTransfers(30)]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            Transfer bags
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Move bags from the Main store to New Mahavir, or bring them back. These moves
            update each store&apos;s stock but never change what&apos;s been sold.
          </p>
        </CardHeader>
        <CardContent>
          <TransferForm lots={lots} />
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
                    <th className="py-2 pr-4">Direction</th>
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
                        {t.dir === "out" ? (
                          <Badge variant="outline" className="text-xs">
                            <ArrowRight className="h-3 w-3 mr-1" />
                            Main → NM
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <ArrowLeft className="h-3 w-3 mr-1" />
                            NM → Main (return)
                          </Badge>
                        )}
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
