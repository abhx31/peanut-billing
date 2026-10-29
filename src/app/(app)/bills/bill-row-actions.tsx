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
  /** Hide Delete (e.g. staff on sale pattis). */
  canDelete?: boolean;
};

export function BillRowActions({
  billId,
  billNo,
  balance,
  labelPrefix = "",
  noun = "bill",
  canDelete = true,
}: Props) {
  const label = `${labelPrefix}${pad2(billNo)}`;
  return (
    <div className="flex gap-1 justify-end items-center">
      <Link href={`/bills/${billId}/print`} target="_blank">
        <Button type="button" size="icon-sm" variant="outline" title="Print">
          <Printer className="h-3.5 w-3.5" />
          <span className="sr-only">Print</span>
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
      {canDelete && (
        <ConfirmDestructive
          title={`Delete this ${noun}?`}
          description={`This will remove the ${noun} and return its bags to stock. All payments linked to it will also be deleted.`}
          confirmLabel={`Delete ${noun}`}
          successMessage={`${noun[0]?.toUpperCase()}${noun.slice(1)} deleted`}
          onConfirm={() => deleteBill({ id: billId })}
          trigger={
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="text-destructive"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Delete</span>
            </Button>
          }
        />
      )}
    </div>
  );
}
