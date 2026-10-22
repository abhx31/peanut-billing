import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import {
  getAllPattiPayments,
  getOutstandingPattiBills,
} from "@/lib/queries-patti";
import { fmtDate, money, pad2 } from "@/lib/format";
import { PayPattiDialog } from "./pay-patti-dialog";
import { DeletePattiPaymentButton } from "./delete-patti-payment-button";

export const dynamic = "force-dynamic";

function billLabel(kind: string | null, no: number) {
  return kind === "gstp" ? `GP ${pad2(no)}` : `P ${pad2(no)}`;
}

export default async function PattiPaymentsPage() {
  await requireOwnerOrEditor();
  const [outstanding, allPayments] = await Promise.all([
    getOutstandingPattiBills(),
    getAllPattiPayments(),
  ]);

  const totalOwed = outstanding.reduce((s, b) => s + b.balance, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Still owed on purchases</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every Patti or GST purchase bill with a balance left — pay it in parts,
            across whatever days and modes it actually takes.
          </p>
        </CardHeader>
        <CardContent>
          {outstanding.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing outstanding — every purchase is fully paid.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">No.</th>
                    <th className="py-2 pr-4">Seller</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4 text-right">Net</th>
                    <th className="py-2 pr-4 text-right">Paid</th>
                    <th className="py-2 pr-4 text-right">Owed</th>
                    <th className="py-2 pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {outstanding.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">
                        {billLabel(b.kind, b.no)}
                      </td>
                      <td className="py-2 pr-4">{b.party}</td>
                      <td className="py-2 pr-4">{fmtDate(b.date)}</td>
                      <td className="py-2 pr-4 text-right">{money(b.net)}</td>
                      <td className="py-2 pr-4 text-right">{money(b.paid)}</td>
                      <td className="py-2 pr-4 text-right font-semibold text-destructive">
                        {money(b.balance)}
                      </td>
                      <td className="py-2 pr-0 text-right">
                        <PayPattiDialog
                          pattiId={b.id}
                          party={b.party}
                          net={b.net}
                          paid={b.paid}
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-4" colSpan={5}>
                      Total still owed
                    </td>
                    <td className="py-2 pr-4 text-right text-destructive">
                      {money(totalOwed)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments recorded</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every payment made toward any purchase bill, newest first.
          </p>
        </CardHeader>
        <CardContent>
          {allPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No purchase payments recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Purchase</th>
                    <th className="py-2 pr-4">Seller</th>
                    <th className="py-2 pr-4">Mode</th>
                    <th className="py-2 pr-4">Note</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {allPayments.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{fmtDate(p.date)}</td>
                      <td className="py-2 pr-4 font-mono">
                        {billLabel(p.pattiKind, p.pattiNo)}
                      </td>
                      <td className="py-2 pr-4">{p.party}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-xs">
                          {p.mode}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {p.note || "—"}
                      </td>
                      <td className="py-2 pr-4 text-right">{money(p.amount)}</td>
                      <td className="py-2 pr-0 text-right">
                        <DeletePattiPaymentButton
                          id={p.id}
                          party={p.party}
                          amount={p.amount}
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
