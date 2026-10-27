import Link from "next/link";
import { Printer, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth-helpers";
import {
  getHamaliForDate,
  getHamaliLoadsForDate,
  getHamaliPaidForDate,
  getRecentHamaliDays,
  getZeroHamaliSaleBillsForDate,
} from "@/lib/queries-hamali";
import { fmtDate, money, pad2, today } from "@/lib/format";
import { getCurrentLoc, locLabel } from "@/lib/loc";
import { SumGrid } from "@/components/sum-grid";
import { DateFilter } from "@/components/date-filter";
import { HamaliPayDialog, HamaliUndoButton } from "./hamali-pay";
import { HamaliLoadDialog } from "./hamali-load-dialog";
import { DeleteHamaliLoadButton } from "./delete-hamali-load-button";
import { SetSaleHamaliDialog } from "./set-sale-hamali-dialog";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ d?: string }> };

export default async function HamaliPage({ searchParams }: Props) {
  const sp = await searchParams;
  const date = sp.d || today();
  const session = await requireSession();
  const role = session.user.role;
  const isPrivileged = role === "owner" || role === "editor";
  const loc = await getCurrentLoc();

  const [h, paid, recent, loads, zeroHamaliBills] = await Promise.all([
    getHamaliForDate(date, loc),
    getHamaliPaidForDate(date, loc),
    getRecentHamaliDays(loc, 14),
    getHamaliLoadsForDate(date, loc),
    getZeroHamaliSaleBillsForDate(date, loc),
  ]);
  const unloadedBags = loads.reduce((s, l) => s + l.bags, 0);
  const loadsTotal = loads.reduce((s, l) => s + Number(l.amount), 0);
  const totalBags = h.totalBags + unloadedBags;
  const totalAmount = h.totalAmount + loadsTotal;

  const outstanding = recent
    .filter((r) => !r.paid)
    .reduce((s, r) => s + r.totalAmount, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Hamali for a date · {locLabel(loc)}
          </CardTitle>
          <CardAction>
            <DateFilter paramKey="d" value={date} />
            <Link href={`/hamali/print?d=${date}`} target="_blank">
              <Button type="button" variant="outline" size="sm">
                <Printer className="mr-1.5 h-4 w-4" />
                Print
              </Button>
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <SumGrid
            items={[
              ["Loaded (sale bills)", `${h.totalBags} bags`],
              ["Unloaded (incoming loads)", `${unloadedBags} bags`],
              ["Total bags", String(totalBags)],
              ["Hamali — total", money(totalAmount)],
              [
                "Status",
                paid
                  ? `Paid ${money(paid.amount)} (${paid.mode})`
                  : totalAmount > 0
                    ? "Not paid yet"
                    : "—",
              ],
            ]}
          />
          {isPrivileged && (
            <div className="flex gap-2">
              {totalAmount > 0 && !paid && (
                <HamaliPayDialog date={date} bags={totalBags} amount={totalAmount} />
              )}
              {paid && <HamaliUndoButton date={date} />}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Loaded (sale bills) and unloaded (incoming loads, below) hamali are paid
            together in one go, using the button above. It adds to Expenses as{" "}
            <b>Hamali</b>, so your cash or UPI balance goes down — kept separate from
            business profit.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hamali breakdown — loaded &amp; unloaded</CardTitle>
          <p className="text-sm text-muted-foreground">
            Loaded = bags going out on this date&apos;s sale bills. Unloaded = bags
            from an incoming purchase load, logged manually.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-2">Loaded (sale bills)</h3>
            {h.bills.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hamali on sale bills this date.
              </p>
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

            {zeroHamaliBills.length > 0 && (
              <div className="mt-3 rounded-lg border border-dashed p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Sale bills on this date with no hamali set yet
                </div>
                <div className="space-y-2">
                  {zeroHamaliBills.map((b) => {
                    const label = `${b.kind === "gst" ? "GST " : "P "}${pad2(b.no)}${b.loc === "NM" ? " (NM)" : ""} · ${b.customer}`;
                    return (
                      <div
                        key={b.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span>
                          {label} <span className="text-muted-foreground">({b.bags} bags)</span>
                        </span>
                        {isPrivileged && (
                          <SetSaleHamaliDialog billId={b.id} label={label} bags={b.bags} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <h3 className="text-sm font-semibold">Unloaded (incoming loads)</h3>
              {isPrivileged && <HamaliLoadDialog mode="add" date={date} />}
            </div>
            {loads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No loads unloaded this date.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-4 text-right">Bags</th>
                      <th className="py-2 pr-4 text-right">₹ / bag</th>
                      <th className="py-2 pr-4 text-right">Amount</th>
                      <th className="py-2 pr-4">Note</th>
                      {isPrivileged && <th className="py-2 pr-0" />}
                    </tr>
                  </thead>
                  <tbody>
                    {loads.map((l) => (
                      <tr key={l.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-right">{l.bags}</td>
                        <td className="py-2 pr-4 text-right">{money(l.ratePerBag)}</td>
                        <td className="py-2 pr-4 text-right">{money(l.amount)}</td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {l.note || "—"}
                        </td>
                        {isPrivileged && (
                          <td className="py-2 pr-0 text-right">
                            <div className="flex gap-1 justify-end items-center">
                              <HamaliLoadDialog
                                mode="edit"
                                id={l.id}
                                initialDate={l.date}
                                initialBags={l.bags}
                                initialRatePerBag={Number(l.ratePerBag)}
                                initialNote={l.note ?? ""}
                              />
                              <DeleteHamaliLoadButton id={l.id} amount={l.amount} />
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-2 pr-4" />
                      <td className="py-2 pr-4" />
                      <td className="py-2 pr-4 text-right">{money(loadsTotal)}</td>
                      <td className="py-2 pr-4" colSpan={isPrivileged ? 2 : 1} />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="border-t pt-3 flex flex-wrap justify-between gap-2 text-sm font-semibold">
            <span>
              Total bags: {totalBags} ({h.totalBags} loaded + {unloadedBags} unloaded)
            </span>
            <span>Total hamali: {money(totalAmount)}</span>
          </div>
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
                    <th className="py-2 pr-4 text-right">Loaded bags</th>
                    <th className="py-2 pr-4 text-right">Unloaded bags</th>
                    <th className="py-2 pr-4 text-right">Total bags</th>
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
                          {fmtDate(r.date)}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-right">{r.loadedBags}</td>
                      <td className="py-2 pr-4 text-right">{r.unloadedBags}</td>
                      <td className="py-2 pr-4 text-right">{r.totalBags}</td>
                      <td className="py-2 pr-4 text-right">{money(r.totalAmount)}</td>
                      <td className="py-2 pr-4">
                        {r.paid ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-success/40 text-success bg-success/10"
                          >
                            {money(r.paid.amount)} ({r.paid.mode})
                          </Badge>
                        ) : r.totalAmount > 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            Not paid
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
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
