"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AmountInput } from "@/components/ui/amount-input";
import { setOpeningBalances } from "./actions";

type Props = { openingCash: number; openingBank: number };

export function OpeningBalanceButton({ openingCash, openingBank }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [cash, setCash] = useState(String(openingCash));
  const [bank, setBank] = useState(String(openingBank));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = Number(cash);
    const b = Number(bank);
    if (!Number.isFinite(c) || !Number.isFinite(b)) {
      toast.error("Enter valid numbers.");
      return;
    }
    startTransition(async () => {
      const res = await setOpeningBalances({ openingCash: c, openingBank: b });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Opening balances updated");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            <Wallet className="mr-1 h-4 w-4" />
            Opening balance
          </Button>
        }
      />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set opening balances</DialogTitle>
          <DialogDescription>
            These are the cash and bank balances carried over before your first ledger entry.
            The daily ledger uses them to compute running closing balances.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <AmountInput
            id="open-cash"
            label="Opening cash in hand (₹)"
            value={cash}
            onChange={setCash}
          />
          <AmountInput
            id="open-bank"
            label="Opening bank / UPI balance (₹)"
            value={bank}
            onChange={setBank}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
