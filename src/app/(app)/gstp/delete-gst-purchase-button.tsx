"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { deleteGstPurchase } from "./actions";

export function DeleteGstPurchaseButton({ id }: { id: string }) {
  return (
    <ConfirmDestructive
      title="Delete this GST purchase?"
      description="Removes the bill and the stock rows it created."
      confirmLabel="Delete"
      successMessage="GST purchase deleted"
      onConfirm={() => deleteGstPurchase({ id })}
      trigger={
        <Button type="button" size="icon-sm" variant="outline" className="text-destructive" title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Delete</span>
        </Button>
      }
    />
  );
}
