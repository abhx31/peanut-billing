"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { deletePatti } from "./actions";

export function DeletePattiButton({ id }: { id: string }) {
  return (
    <ConfirmDestructive
      title="Delete this patti bill?"
      description="Removes it from the ledger too. Payments made against it are undone."
      confirmLabel="Delete"
      successMessage="Patti deleted"
      onConfirm={() => deletePatti({ id })}
      trigger={
        <Button type="button" size="icon-sm" variant="outline" className="text-destructive" title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Delete</span>
        </Button>
      }
    />
  );
}
