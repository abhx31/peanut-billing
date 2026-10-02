import { getLotsWithStock, getLotCosts } from "@/lib/queries";
import { requireSession } from "@/lib/auth-helpers";
import { money } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddLotForm } from "./add-lot-form";
import { LotRowActions } from "./lot-row-actions";

export const dynamic = "force-dynamic";

export default async function LotsPage() {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const [lots, costs] = await Promise.all([
    getLotsWithStock(),
    isOwner ? getLotCosts() : Promise.resolve({} as Record<string, string>),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add lot</CardTitle>
        </CardHeader>
        <CardContent>
          <AddLotForm isOwner={isOwner} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stock</CardTitle>
        </CardHeader>
        <CardContent>
          {lots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lots yet. Add one above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Lot / quality</th>
                    <th className="py-2 pr-4 text-right">Bags left</th>
                    {isOwner && <th className="py-2 pr-4 text-right">Cost / kg</th>}
                    <th className="py-2 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{l.name}</td>
                      <td
                        className={`py-2 pr-4 text-right font-semibold ${l.left <= 0 ? "text-destructive" : ""}`}
                      >
                        {l.left}
                      </td>
                      {isOwner && (
                        <td className="py-2 pr-4 text-right">
                          {costs[l.id] ? (
                            money(costs[l.id])
                          ) : (
                            <span className="text-destructive">not set</span>
                          )}
                        </td>
                      )}
                      <td className="py-2 pr-0 text-right">
                        <LotRowActions
                          lotId={l.id}
                          lotName={l.name}
                          currentCost={costs[l.id] ?? ""}
                          isOwner={isOwner}
                        />
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
