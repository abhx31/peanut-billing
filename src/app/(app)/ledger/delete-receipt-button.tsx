"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { deleteBillPayment, deleteOldDuePayment } from "./receipt-actions";

type Props = {
  id: string;
  kind: "bill" | "opening";
  /** Short label shown in the confirmation ("Bill 05", "Old due", "Advance") */
  label: string;
  amount: string | number;
};

export function DeleteReceiptButton({ id, kind, label, amount }: Props) {
  const amt =
    typeof amount === "number"
      ? "₹" + amount.toLocaleString("en-IN")
      : "₹" + Number(amount).toLocaleString("en-IN");
  return (
    <ConfirmDestructive
      title="Delete this receipt?"
      description={`${label} — ${amt}. The customer's balance will go back up by this amount; the Daily ledger will drop it from Money received.`}
      confirmLabel="Delete receipt"
      successMessage="Receipt deleted"
      onConfirm={() =>
        kind === "bill" ? deleteBillPayment({ id }) : deleteOldDuePayment({ id })
      }
      trigger={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive"
          aria-label="Delete receipt"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      }
    />
  );
}
