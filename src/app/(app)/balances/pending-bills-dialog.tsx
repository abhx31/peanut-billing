"use client";

import { ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fmtDate, money, pad2 } from "@/lib/format";

export type PendingBill = {
  id: string;
  no: number;
  kind: "normal" | "gst" | "psale";
  loc: "MS" | "NM";
  date: string;
  total: number;
  balance: number;
};

export function pendingBillLabel(p: PendingBill) {
  const prefix = p.kind === "gst" ? "GST " : p.kind === "psale" ? "P " : "";
  return `${prefix}${pad2(p.no)}${p.loc === "NM" ? " (NM)" : ""}`;
}

/** A customer's unpaid bills behind one compact button, so the Balances row stays one line. */
export function PendingBillsDialog({
  customer,
  pending,
}: {
  customer: string;
  pending: PendingBill[];
}) {
  const totalDue = pending.reduce((s, p) => s + p.balance, 0);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="whitespace-nowrap"
            title="Show pending bills"
          >
            <ReceiptText className="h-3.5 w-3.5" />
            {pending.length} bill{pending.length === 1 ? "" : "s"} · {money(totalDue)}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pending bills — {customer}</DialogTitle>
          <DialogDescription>
            Bills with money still owing, oldest first. Receipts clear them in this order.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-popover">
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4">Bill</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4 text-right">Total</th>
                <th className="py-2 pr-4 text-right">Paid</th>
                <th className="py-2 pr-0 text-right">Owing</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-mono whitespace-nowrap">{pendingBillLabel(p)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(p.date)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(p.total)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {money(p.total - p.balance)}
                  </td>
                  <td className="py-2 pr-0 text-right tabular-nums text-destructive">
                    {money(p.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold border-t">
                <td className="py-2 pr-4" colSpan={4}>
                  Total owing on {pending.length} bill{pending.length === 1 ? "" : "s"}
                </td>
                <td className="py-2 pr-0 text-right tabular-nums text-destructive">
                  {money(totalDue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
