"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { deleteExpense } from "./actions";

export function DeleteExpenseButton({ id }: { id: string }) {
  return (
    <ConfirmDestructive
      title="Delete this expense?"
      description="This cannot be undone."
      confirmLabel="Delete expense"
      successMessage="Expense deleted"
      onConfirm={() => deleteExpense({ id })}
      trigger={
        <Button type="button" size="icon-sm" variant="outline" className="text-destructive" title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Delete</span>
        </Button>
      }
    />
  );
}
