"use client";

import { History } from "lucide-react";
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
import { DeletePattiPaymentButton } from "../patti-payments/delete-patti-payment-button";
import { EditPattiPaymentDialog } from "../patti-payments/edit-patti-payment-dialog";

export type PattiPayment = {
  id: string;
  date: string;
  mode: "Cash" | "UPI" | "CJ";
  amount: string;
  note: string | null;
};

/**
 * The payments recorded on one purchase patti, behind a small button on its
 * row. Owner / editor can edit or undo (delete) a payment from here.
 */
export function PattiPaymentsDialog({
  pattiNo,
  party,
  net,
  payments,
  canEdit,
}: {
  pattiNo: number;
  party: string;
  net: number;
  payments: PattiPayment[];
  canEdit: boolean;
}) {
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const owed = Math.max(0, net - paid);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            title={`Payments on patti ${pad2(pattiNo)}${canEdit ? " — edit or undo" : ""}`}
          >
            <History className="h-3.5 w-3.5" />
            Payments ({payments.length})
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Payments · Patti {pad2(pattiNo)} · {party}
          </DialogTitle>
          <DialogDescription>
            {canEdit
              ? "Every payment made on this purchase. Edit or undo one here — the patti's balance and the Daily ledger update to match."
              : "Every payment made on this purchase. The owner or an editor can edit or undo one."}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-popover">
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Mode</th>
                <th className="py-2 pr-4">Note</th>
                <th className="py-2 pr-4 text-right">Amount</th>
                {canEdit && <th className="py-2 pr-0" />}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(p.date)}</td>
                  <td className="py-2 pr-4">{p.mode}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{p.note || "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(p.amount)}</td>
                  {canEdit && (
                    <td className="py-2 pr-0 text-right">
                      <div className="flex gap-1 justify-end items-center">
                        <EditPattiPaymentDialog
                          id={p.id}
                          billLabel={`P ${pad2(pattiNo)}`}
                          party={party}
                          amount={Number(p.amount)}
                          mode={p.mode}
                          date={p.date}
                          note={p.note}
                        />
                        <DeletePattiPaymentButton id={p.id} party={party} amount={p.amount} undo />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold border-t">
                <td className="py-2 pr-4" colSpan={3}>
                  Paid {money(paid)} of {money(net)}
                </td>
                <td
                  className={`py-2 pr-4 text-right tabular-nums ${owed > 0.5 ? "text-destructive" : ""}`}
                >
                  {owed > 0.5 ? `${money(owed)} owed` : "Fully paid"}
                </td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
