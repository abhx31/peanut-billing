"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { deleteOldDue } from "./actions";

export function DeleteOldDueButton({ id, customer }: { id: string; customer: string }) {
  return (
    <ConfirmDestructive
      title={`Delete old due for ${customer}?`}
      description="This also removes any payments recorded against it."
      confirmLabel="Delete due"
      successMessage="Old due deleted"
      onConfirm={() => deleteOldDue({ id })}
      trigger={
        <Button type="button" size="icon-sm" variant="outline" className="text-destructive" title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Delete</span>
        </Button>
      }
    />
  );
}
