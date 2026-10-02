"use client";

import { ReceiveDialog } from "@/components/receive-dialog";
import { receiveFromCustomer } from "../bills/actions";

type Props = { customer: string; balance: number };

export function ReceiveFromCustomerButton({ customer, balance }: Props) {
  return (
    <ReceiveDialog
      title={`Receive from ${customer}`}
      description="The payment is applied to this customer's oldest unpaid bills first."
      balance={balance}
      defaultAmount={balance}
      onConfirm={({ amount, mode }) =>
        receiveFromCustomer({ customer, amount, mode })
      }
    />
  );
}
