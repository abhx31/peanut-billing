import Link from "next/link";
import { Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth-helpers";
import { getLotsWithStock, getStockHistory, getLotCosts, lotStockAt } from "@/lib/queries";
import { getCurrentLoc, locLabel } from "@/lib/loc";
import { fmtDate, money, r2, today } from "@/lib/format";
import { SumGrid } from "@/components/sum-grid";
import { DateFilter } from "@/components/date-filter";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ d?: string }> };

export default async function StockPage({ searchParams }: Props) {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const loc = await getCurrentLoc();
  const storeName = locLabel(loc);
  // A picked date shows the closing stock at the end of that day.
  const sp = await searchParams;
  const asOf = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : undefined;
  const [allLots, history, costs] = await Promise.all([
    getLotsWithStock({ asOf }),
    getStockHistory(loc, 30),
    isOwner ? getLotCosts() : Promise.resolve({} as Record<string, string>),
  ]);

  // Only this store's stock. Lots that have never been at this store are hidden.
  const lots = allLots
    .map((l) => ({ id: l.id, name: l.name, ...lotStockAt(l, loc) }))
    .filter((l) => l.known);
  const totals: [string, string][] = [
    ["Lots", String(lots.length)],
    ["Bags added", String(lots.reduce((s, l) => s + l.added, 0))],
    [
      loc === "NM" ? "Received (net)" : "Sent to New Mahavir (net)",
      String(Math.abs(lots.reduce((s, l) => s + l.moved, 0))),
    ],
    ["Bags sold", String(lots.reduce((s, l) => s + l.sold, 0))],
    ["Bags left", String(lots.reduce((s, l) => s + l.left, 0))],
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {asOf ? `Closing stock on ${fmtDate(asOf)}` : "Stock left"} · {storeName}
          </CardTitle>
          <div className="flex items-end gap-3 flex-wrap">
            <DateFilter paramKey="d" value={asOf ?? today()} />
            <Link href={asOf ? `/stock/print?d=${asOf}` : "/stock/print"} target="_blank">
              <Button type="button" variant="outline" size="sm">
                <Printer className="mr-2 h-4 w-4" />
                Print stock left
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <SumGrid items={totals} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4">Lot / quality</th>
                  <th className="py-2 pr-4 text-right">Added</th>
                  <th className="py-2 pr-4 text-right">Transfers (net)</th>
                  <th className="py-2 pr-4 text-right">Sold</th>
                  <th className="py-2 pr-4 text-right">Left</th>
                  <th className="py-2 pr-4 text-right">Kg sold</th>
                  {isOwner && <th className="py-2 pr-4 text-right">Cost / kg</th>}
                </tr>
              </thead>
              <tbody>
                {lots.length === 0 ? (
                  <tr>
                    <td colSpan={isOwner ? 7 : 6} className="py-2 text-muted-foreground">
                      No stock at {storeName} yet.
                    </td>
                  </tr>
                ) : (
                  lots.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{l.name}</td>
                      <td className="py-2 pr-4 text-right">{l.added}</td>
                      <td className="py-2 pr-4 text-right">
                        {l.moved > 0 ? `+${l.moved}` : l.moved}
                      </td>
                      <td className="py-2 pr-4 text-right">{l.sold}</td>
                      <td
                        className={`py-2 pr-4 text-right font-semibold ${l.left <= 0 ? "text-destructive" : ""}`}
                      >
                        {l.left}
                      </td>
                      <td className="py-2 pr-4 text-right">{r2(l.kgSold)}</td>
                      {isOwner && (
                        <td className="py-2 pr-4 text-right">
                          {costs[l.id] ? money(costs[l.id]) : <span className="text-destructive">not set</span>}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stock added at {storeName} (latest 30)</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Lot / quality</th>
                    <th className="py-2 pr-4 text-right">Bags added</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{fmtDate(h.date)}</td>
                      <td className="py-2 pr-4">{h.lotName ?? "(deleted lot)"}</td>
                      <td className="py-2 pr-4 text-right">{h.bags}</td>
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
