"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { money } from "@/lib/format";
import { deletePattiPayment } from "./actions";

type Props = {
  id: string;
  party: string;
  amount: string | number;
};

export function DeletePattiPaymentButton({ id, party, amount }: Props) {
  return (
    <ConfirmDestructive
      title="Delete this payment?"
      description={`${party} — ${money(amount)}. The purchase bill's outstanding balance will go back up by this amount.`}
      confirmLabel="Delete payment"
      successMessage="Payment deleted"
      onConfirm={() => deletePattiPayment({ id })}
      trigger={
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
      }
    />
  );
}
