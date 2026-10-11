"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { deleteTransfer } from "./actions";

export function DeleteTransferButton({ id }: { id: string }) {
  return (
    <ConfirmDestructive
      title="Delete this transfer?"
      description="The stock moves back to where it came from."
      confirmLabel="Delete transfer"
      successMessage="Transfer deleted"
      onConfirm={() => deleteTransfer({ id })}
      trigger={
        <Button type="button" size="sm" variant="outline" className="text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:ml-1">Delete</span>
        </Button>
      }
    />
  );
}
