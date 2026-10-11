import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth-helpers";
import { getLotsWithStock, getStockHistory, getLotCosts } from "@/lib/queries";
import { money, r2 } from "@/lib/format";
import { SumGrid } from "@/components/sum-grid";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const [lots, history, costs] = await Promise.all([
    getLotsWithStock(),
    getStockHistory(30),
    isOwner ? getLotCosts() : Promise.resolve({} as Record<string, string>),
  ]);

  const totalStkM = lots.reduce((s, l) => s + l.stkM, 0);
  const totalStkN = lots.reduce((s, l) => s + l.stkN, 0);
  const totals: [string, string][] = [
    ["Lots", String(lots.length)],
    ["Bags added", String(lots.reduce((s, l) => s + l.added, 0))],
    ["Bags sold", String(lots.reduce((s, l) => s + l.sold, 0))],
    ["Main store left", String(totalStkM)],
    ["New Mahavir left", String(totalStkN)],
    ["Total left", String(totalStkM + totalStkN)],
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Stock left</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SumGrid items={totals} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4">Lot / quality</th>
                  <th className="py-2 pr-4 text-right">Added</th>
                  <th className="py-2 pr-4 text-right">Sold</th>
                  <th className="py-2 pr-4 text-right">Main left</th>
                  <th className="py-2 pr-4 text-right">NM left</th>
                  <th className="py-2 pr-4 text-right">Total left</th>
                  <th className="py-2 pr-4 text-right">Kg sold</th>
                  {isOwner && <th className="py-2 pr-4 text-right">Cost / kg</th>}
                </tr>
              </thead>
              <tbody>
                {lots.length === 0 ? (
                  <tr>
                    <td colSpan={isOwner ? 8 : 7} className="py-2 text-muted-foreground">
                      No lots yet.
                    </td>
                  </tr>
                ) : (
                  lots.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{l.name}</td>
                      <td className="py-2 pr-4 text-right">{l.added}</td>
                      <td className="py-2 pr-4 text-right">{l.sold}</td>
                      <td
                        className={`py-2 pr-4 text-right ${l.stkM < 0 ? "text-destructive" : ""}`}
                      >
                        {l.stkM}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right ${l.stkN < 0 ? "text-destructive" : ""}`}
                      >
                        {l.stkN}
                      </td>
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
          <CardTitle>Stock added (latest 30)</CardTitle>
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
                    <th className="py-2 pr-4">Store</th>
                    <th className="py-2 pr-4 text-right">Bags added</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{h.date}</td>
                      <td className="py-2 pr-4">{h.lotName ?? "(deleted lot)"}</td>
                      <td className="py-2 pr-4">
                        {h.loc === "NM" ? "New Mahavir" : "Main store"}
                      </td>
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
