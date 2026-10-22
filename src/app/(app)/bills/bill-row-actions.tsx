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
  /** Shown before the padded number, e.g. "P " for sale patti ("P 05"). */
  labelPrefix?: string;
  /** Singular noun for dialogs/confirmations, e.g. "sale patti" instead of "bill". */
  noun?: string;
};

export function BillRowActions({
  billId,
  billNo,
  balance,
  labelPrefix = "",
  noun = "bill",
}: Props) {
  const label = `${labelPrefix}${pad2(billNo)}`;
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
          title={`Receive for ${noun} #${label}`}
          description="Select payment mode, date and the amount received."
          balance={balance}
          defaultAmount={balance}
          onConfirm={({ amount, mode, date, note }) =>
            receivePaymentForBill({ billId, amount, mode, date, note })
          }
        />
      )}
      <ConfirmDestructive
        title={`Delete this ${noun}?`}
        description={`This will remove the ${noun} and return its bags to stock. All payments linked to it will also be deleted.`}
        confirmLabel={`Delete ${noun}`}
        successMessage={`${noun[0]?.toUpperCase()}${noun.slice(1)} deleted`}
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
