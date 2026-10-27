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
        <Button type="button" size="icon-sm" variant="outline" className="text-destructive" title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Delete</span>
        </Button>
      }
    />
  );
}
