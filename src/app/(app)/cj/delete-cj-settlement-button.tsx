"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { deleteCjSettlement } from "./actions";

export function DeleteCjSettlementButton({ id }: { id: string }) {
  return (
    <ConfirmDestructive
      title="Delete this settlement?"
      description="Removes it from the ledger. CJ outstanding goes back up by this amount."
      confirmLabel="Delete"
      successMessage="Settlement deleted"
      onConfirm={() => deleteCjSettlement({ id })}
      trigger={
        <Button type="button" size="sm" variant="outline" className="text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:ml-1">Delete</span>
        </Button>
      }
    />
  );
}
