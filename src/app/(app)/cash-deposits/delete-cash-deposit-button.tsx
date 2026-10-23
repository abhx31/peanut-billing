"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { money } from "@/lib/format";
import { deleteCashDeposit } from "./actions";

export function DeleteCashDepositButton({
  id,
  amount,
}: {
  id: string;
  amount: string | number;
}) {
  return (
    <ConfirmDestructive
      title="Delete this cash deposit?"
      description={`${money(amount)} will go back into Cash in hand and back out of Bank / UPI.`}
      confirmLabel="Delete deposit"
      successMessage="Deposit deleted"
      onConfirm={() => deleteCashDeposit({ id })}
      trigger={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive"
          aria-label="Delete deposit"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      }
    />
  );
}
