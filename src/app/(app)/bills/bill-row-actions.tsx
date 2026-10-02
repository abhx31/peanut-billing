"use client";

import Link from "next/link";
import { Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pad2 } from "@/lib/format";
import { ReceiveDialog } from "@/components/receive-dialog";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { deleteBill, receivePaymentForBill } from "./actions";

type Props = {
  billId: string;
  billNo: number;
  balance: number;
};

export function BillRowActions({ billId, billNo, balance }: Props) {
  return (
    <div className="flex gap-1 justify-end flex-wrap">
      <Link href={`/bills/${billId}/print`} target="_blank">
        <Button type="button" size="sm" variant="outline">
          <Printer className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:ml-1">Print</span>
        </Button>
      </Link>
      {balance > 0.5 && (
        <ReceiveDialog
          title={`Receive for bill #${pad2(billNo)}`}
          description="Select payment mode and enter the amount received."
          balance={balance}
          defaultAmount={balance}
          onConfirm={({ amount, mode }) =>
            receivePaymentForBill({ billId, amount, mode })
          }
        />
      )}
      <ConfirmDestructive
        title="Delete this bill?"
        description="This will remove the bill and return its bags to stock. All payments linked to this bill will also be deleted."
        confirmLabel="Delete bill"
        successMessage="Bill deleted"
        onConfirm={() => deleteBill({ id: billId })}
        trigger={
          <Button type="button" size="sm" variant="outline" className="text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Delete</span>
          </Button>
        }
      />
    </div>
  );
}
