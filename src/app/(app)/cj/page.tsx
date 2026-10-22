import { HandCoins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth-helpers";
import {
  getCjPaymentsLatest,
  getCjSettlementsLatest,
  getCjTotals,
} from "@/lib/queries-cj";
import { fmtDate, money, pad2 } from "@/lib/format";
import { SumGrid } from "@/components/sum-grid";
import { CjSettlementForm } from "./cj-settlement-form";
import { DeleteCjSettlementButton } from "./delete-cj-settlement-button";

export const dynamic = "force-dynamic";

export default async function CJPage() {
  const session = await requireSession();
  const role = session.user.role;
  const isPrivileged = role === "owner" || role === "editor";

  const [totals, settlements, received] = await Promise.all([
    getCjTotals(),
    getCjSettlementsLatest(50),
    getCjPaymentsLatest(40),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-primary" />
            Payments received through CJ
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            CJ is a go-between: when UPI fails, the customer pays CJ, and CJ hands you
            cash or UPI later. CJ money only shows up in your ledger after you{" "}
            <b>record a settlement</b> below.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <SumGrid
            items={[
              ["With CJ now", money(totals.outstanding)],
              ["Received via CJ (all)", money(totals.received)],
              ["CJ paid you (all)", money(totals.settled)],
              ["Received today", money(totals.receivedToday)],
              ...(totals.opening !== 0
                ? [["Brought forward (closed years)", money(totals.opening)] as [string, string]]
                : []),
            ]}
          />
          {isPrivileged && <CjSettlementForm />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settlements (CJ paid you)</CardTitle>
        </CardHeader>
        <CardContent>
          {settlements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No settlements yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-4">Received as</th>
                    <th className="py-2 pr-4">Note</th>
                    {isPrivileged && <th className="py-2 pr-0" />}
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{fmtDate(s.date)}</td>
                      <td className="py-2 pr-4 text-right font-semibold">
                        {money(s.amount)}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="secondary" className="text-xs">
                          {s.mode}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {s.note ?? ""}
                      </td>
                      {isPrivileged && (
                        <td className="py-2 pr-0 text-right">
                          <DeleteCjSettlementButton id={s.id} />
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

      <Card>
        <CardHeader>
          <CardTitle>Received through CJ (latest 40)</CardTitle>
        </CardHeader>
        <CardContent>
          {received.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing received through CJ yet. Choose <b>Paid via CJ</b> on a bill.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Bill no.</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {received.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{fmtDate(p.date)}</td>
                      <td className="py-2 pr-4 font-mono">
                        {p.billKind === "gst" ? "GST " : ""}
                        {pad2(p.billNo)}
                        {p.loc === "NM" ? " (NM)" : ""}
                      </td>
                      <td className="py-2 pr-4">{p.customer}</td>
                      <td className="py-2 pr-4 text-right">{money(p.amount)}</td>
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
