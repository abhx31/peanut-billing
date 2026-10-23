"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { money } from "@/lib/format";
import { deleteHamaliLoad } from "./actions";

export function DeleteHamaliLoadButton({
  id,
  amount,
}: {
  id: string;
  amount: string | number;
}) {
  return (
    <ConfirmDestructive
      title="Delete this hamali load entry?"
      description={`Removes this ${money(amount)} load from the day's hamali total. If that day's hamali has already been paid, you'll need to Undo and pay again to reflect the change.`}
      confirmLabel="Delete entry"
      successMessage="Hamali load entry deleted"
      onConfirm={() => deleteHamaliLoad({ id })}
      trigger={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive"
          aria-label="Delete hamali load entry"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      }
    />
  );
}
