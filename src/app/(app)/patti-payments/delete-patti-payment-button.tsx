"use client";

import { Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { money } from "@/lib/format";
import { deletePattiPayment } from "./actions";

type Props = {
  id: string;
  party: string;
  amount: string | number;
  /** Word it as "Undo" (a labelled button) instead of a trash icon. */
  undo?: boolean;
};

export function DeletePattiPaymentButton({ id, party, amount, undo = false }: Props) {
  return (
    <ConfirmDestructive
      title={undo ? "Undo this payment?" : "Delete this payment?"}
      description={`${party} — ${money(amount)}. The purchase bill's outstanding balance will go back up by this amount.`}
      confirmLabel={undo ? "Undo payment" : "Delete payment"}
      successMessage={undo ? "Payment undone" : "Payment deleted"}
      onConfirm={() => deletePattiPayment({ id })}
      trigger={
        undo ? (
          <Button type="button" size="sm" variant="outline" className="text-destructive">
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </Button>
        ) : (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="text-destructive"
            title="Delete"
            aria-label="Delete payment"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )
      }
    />
  );
}
