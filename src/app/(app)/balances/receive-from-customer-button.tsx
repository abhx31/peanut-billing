"use client";

import { ReceiveDialog } from "@/components/receive-dialog";
import { receiveFromCustomer } from "../bills/actions";

type Props = { customer: string; balance: number };

export function ReceiveFromCustomerButton({ customer, balance }: Props) {
  return (
    <ReceiveDialog
      title={`Receive from ${customer}`}
      description="Old dues clear first, then the oldest unpaid bills. Anything left over is kept as an advance."
      balance={balance}
      defaultAmount={balance}
      onConfirm={({ amount, mode, date, note }) =>
        receiveFromCustomer({ customer, amount, mode, date, note })
      }
    />
  );
}
