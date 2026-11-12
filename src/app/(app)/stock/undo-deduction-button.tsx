"use client";

import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { undoDeduction } from "../lots/actions";

export function UndoDeductionButton({ id, bags }: { id: string; bags: number }) {
  return (
    <ConfirmDestructive
      title="Undo this deduction?"
      description={`The ${bags} bags go back into stock.`}
      confirmLabel="Undo deduction"
      successMessage="Deduction undone"
      onConfirm={() => undoDeduction({ id })}
      trigger={
        <Button type="button" size="icon-sm" variant="outline" title="Undo deduction">
          <Undo2 className="h-3.5 w-3.5" />
          <span className="sr-only">Undo deduction</span>
        </Button>
      }
    />
  );
}
