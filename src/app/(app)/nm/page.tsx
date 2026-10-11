import { ArrowLeftRight, ArrowRight, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth-helpers";
import {
  getLatestTransfers,
  getNmSalesSummary,
} from "@/lib/queries-nm";
import {
  getBillsByDate,
  getLotsWithStock,
} from "@/lib/queries";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { Trash2 } from "lucide-react";
import { money, pad2, today } from "@/lib/format";
import { DateFilter } from "@/components/date-filter";
import { SumGrid } from "@/components/sum-grid";
import { TransferForm } from "./transfer-form";
import { deleteTransfer } from "./actions";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ d?: string }> };

export default async function NewMahavirPage({ searchParams }: Props) {
  const sp = await searchParams;
  const date = sp.d || today();
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const isPrivileged = isOwner || session.user.role === "editor";

  const [lots, transfers, nmBills, nmSales] = await Promise.all([
    getLotsWithStock(),
    getLatestTransfers(30),
    getBillsByDate(date, isOwner).then((bs) => bs.filter((b) => (b as unknown as { loc?: string }).loc === "NM")),
    getNmSalesSummary(date),
  ]);

  const totalRecvN = lots.reduce((s, l) => s + l.recvN, 0);
  const totalSoldN = lots.reduce((s, l) => s + l.soldN, 0);
  const totalStkN = lots.reduce((s, l) => s + l.stkN, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            Transfer stock
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Move bags from the Main store to New Mahavir, or bring them back. These moves
            update the per-store stock but never change what&apos;s been sold.
          </p>
        </CardHeader>
        <CardContent>
          <TransferForm lots={lots} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stock at New Mahavir</CardTitle>
          <SumGrid
            items={[
              ["Received (net)", String(totalRecvN)],
              ["Sold", String(totalSoldN)],
              ["Left", String(totalStkN)],
            ]}
          />
        </CardHeader>
        <CardContent>
          {lots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lots yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Lot / quality</th>
                    <th className="py-2 pr-4 text-right">Received</th>
                    <th className="py-2 pr-4 text-right">Sold</th>
                    <th className="py-2 pr-4 text-right">Left at NM</th>
                    <th className="py-2 pr-4 text-right">Main store</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{l.name}</td>
                      <td className="py-2 pr-4 text-right">{l.recvN}</td>
                      <td className="py-2 pr-4 text-right">{l.soldN}</td>
                      <td
                        className={`py-2 pr-4 text-right font-semibold ${l.stkN < 0 ? "text-destructive" : ""}`}
                      >
                        {l.stkN}
                      </td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">
                        {l.stkM}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New Mahavir sales</CardTitle>
          <DateFilter paramKey="d" value={date} />
        </CardHeader>
        <CardContent>
          <SumGrid
            items={[
              ["Bills", String(nmSales.bills)],
              ["Bags sold", String(nmSales.bags)],
              ["Sales", money(nmSales.sales)],
            ]}
          />
          <div className="overflow-x-auto mt-4">
            {nmBills.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No New Mahavir bills on this date.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">No.</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Lot</th>
                    <th className="py-2 pr-4 text-right">Bags</th>
                    <th className="py-2 pr-4 text-right">Total</th>
                    <th className="py-2 pr-4 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {nmBills.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">
                        {pad2(b.no)} (NM)
                      </td>
                      <td className="py-2 pr-4">{b.customer}</td>
                      <td className="py-2 pr-4">{b.lotSummary}</td>
                      <td className="py-2 pr-4 text-right">{b.bags}</td>
                      <td className="py-2 pr-4 text-right">{money(b.total)}</td>
                      <td
                        className={`py-2 pr-4 text-right ${b.balance > 0.5 ? "text-destructive" : ""}`}
                      >
                        {money(b.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
                      <td className="py-2 pr-4">{t.date}</td>
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
                          <ConfirmDestructive
                            title="Delete this transfer?"
                            description="The stock moves back to where it came from."
                            confirmLabel="Delete transfer"
                            successMessage="Transfer deleted"
                            onConfirm={() => deleteTransfer({ id: t.id })}
                            trigger={
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="sr-only sm:not-sr-only sm:ml-1">
                                  Delete
                                </span>
                              </Button>
                            }
                          />
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
