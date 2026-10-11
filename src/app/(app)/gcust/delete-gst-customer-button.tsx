"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { deleteGstCustomer } from "./actions";

export function DeleteGstCustomerButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmDestructive
      title={`Delete ${name}?`}
      description="Past invoices keep the buyer snapshot, so this won't change history."
      confirmLabel="Delete"
      successMessage="Customer deleted"
      onConfirm={() => deleteGstCustomer({ id })}
      trigger={
        <Button type="button" size="sm" variant="outline" className="text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:ml-1">Delete</span>
        </Button>
      }
    />
  );
}
