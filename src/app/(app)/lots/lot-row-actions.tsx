"use client";

import { Package, PlusCircle, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { NumberPromptDialog } from "@/components/number-prompt-dialog";
import { addBags, deleteLot, setLotCost } from "./actions";

type Props = {
  lotId: string;
  lotName: string;
  currentCost: string;
  isOwner: boolean;
};

export function LotRowActions({ lotId, lotName, currentCost, isOwner }: Props) {
  return (
    <div className="flex gap-1 justify-end flex-wrap">
      <NumberPromptDialog
        title={`Add bags to "${lotName}"`}
        label="Bags to add"
        confirmLabel="Add"
        step="1"
        min="1"
        successMessage="Bags added"
        onConfirm={async (bags) => addBags({ lotId, bags: Math.floor(bags) })}
        trigger={
          <Button type="button" size="sm" variant="outline">
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Bags</span>
          </Button>
        }
      />
      {isOwner && (
        <NumberPromptDialog
          title={`Cost per kg for "${lotName}"`}
          label="Cost per kg (₹)"
          confirmLabel="Save cost"
          defaultValue={currentCost}
          successMessage="Cost updated"
          onConfirm={async (costPerKg) => setLotCost({ lotId, costPerKg })}
          trigger={
            <Button type="button" size="sm" variant="outline">
              <Tag className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:ml-1">Cost</span>
            </Button>
          }
        />
      )}
      <ConfirmDestructive
        title={`Delete lot "${lotName}"?`}
        description="Old bills referencing this lot keep its name. The lot will stop appearing in dropdowns and stock listings."
        confirmLabel="Delete lot"
        successMessage="Lot deleted"
        onConfirm={() => deleteLot({ lotId })}
        trigger={
          <Button type="button" size="sm" variant="outline" className="text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Delete</span>
          </Button>
        }
      />
      <span className="sr-only">
        <Package />
      </span>
    </div>
  );
}
