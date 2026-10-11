import Link from "next/link";
import { Printer, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth-helpers";
import {
  getHamaliForDate,
  getHamaliPaidForDate,
  getRecentHamaliDays,
} from "@/lib/queries-hamali";
import { money, pad2, today } from "@/lib/format";
import { SumGrid } from "@/components/sum-grid";
import { DateFilter } from "@/components/date-filter";
import { HamaliPayDialog, HamaliUndoButton } from "./hamali-pay";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ d?: string }> };

export default async function HamaliPage({ searchParams }: Props) {
  const sp = await searchParams;
  const date = sp.d || today();
  const session = await requireSession();
  const role = session.user.role;
  const isPrivileged = role === "owner" || role === "editor";

  const [h, paid, recent] = await Promise.all([
    getHamaliForDate(date),
    getHamaliPaidForDate(date),
    getRecentHamaliDays(14),
  ]);

  const outstanding = recent
    .filter((r) => !r.paid)
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Hamali for a date
          </CardTitle>
          <div className="flex items-end gap-3 flex-wrap">
            <DateFilter paramKey="d" value={date} />
            <Link href={`/hamali/print?d=${date}`} target="_blank">
              <Button type="button" variant="outline" size="sm">
                <Printer className="mr-2 h-4 w-4" />
                Print statement
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <SumGrid
            items={[
              ["Bills with hamali", String(h.bills.length)],
              ["Bags", String(h.totalBags)],
              ["Hamali to pay", money(h.totalAmount)],
              [
                "Status",
                paid
                  ? `Paid ${money(paid.amount)} (${paid.mode})`
                  : h.totalAmount > 0
                    ? "Not paid yet"
                    : "—",
              ],
            ]}
          />
          {isPrivileged && (
            <div className="flex gap-2">
              {h.totalAmount > 0 && !paid && (
                <HamaliPayDialog
                  date={date}
                  bags={h.totalBags}
                  amount={h.totalAmount}
                />
              )}
              {paid && <HamaliUndoButton date={date} />}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Recording the payment adds it to Expenses as <b>Hamali</b>, so your cash or
            UPI balance goes down on that day. Hamali expenses are kept separate from
            business profit (they don&apos;t reduce profit).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hamali charged on this date&apos;s bills</CardTitle>
        </CardHeader>
        <CardContent>
          {h.bills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hamali on this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Bill no.</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4 text-right">Bags</th>
                    <th className="py-2 pr-4 text-right">₹ / bag</th>
                    <th className="py-2 pr-4 text-right">Hamali</th>
                  </tr>
                </thead>
                <tbody>
                  {h.bills.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono">
                        {b.kind === "gst" ? "GST " : ""}
                        {pad2(b.no)}
                        {b.loc === "NM" ? " (NM)" : ""}
                      </td>
                      <td className="py-2 pr-4">{b.customer}</td>
                      <td className="py-2 pr-4 text-right">{b.bags}</td>
                      <td className="py-2 pr-4 text-right">{money(b.hamaliPerBag)}</td>
                      <td className="py-2 pr-4 text-right">{money(b.hamali)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-4">Total</td>
                    <td />
                    <td className="py-2 pr-4 text-right">{h.totalBags}</td>
                    <td />
                    <td className="py-2 pr-4 text-right">{money(h.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent days</CardTitle>
          <p className="text-sm text-muted-foreground">
            Outstanding (not paid yet): <b>{money(outstanding)}</b>
          </p>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hamali yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4 text-right">Bags</th>
                    <th className="py-2 pr-4 text-right">Hamali</th>
                    <th className="py-2 pr-4">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr
                      key={r.date}
                      className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                    >
                      <td className="py-2 pr-4">
                        <Link
                          href={`/hamali?d=${r.date}`}
                          className="block underline-offset-2 hover:underline"
                        >
                          {r.date}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-right">{r.bags}</td>
                      <td className="py-2 pr-4 text-right">{money(r.amount)}</td>
                      <td className="py-2 pr-4">
                        {r.paid ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-success/40 text-success bg-success/10"
                          >
                            {money(r.paid.amount)} ({r.paid.mode})
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            Not paid
                          </Badge>
                        )}
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
