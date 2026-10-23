"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { today } from "@/lib/format";
import { addCashDeposit, updateCashDeposit } from "./actions";

type Props =
  | {
      mode: "add";
    }
  | {
      mode: "edit";
      id: string;
      initialDate: string;
      initialAmount: number;
      initialNote: string;
    };

export function CashDepositDialog(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(props.mode === "edit" ? props.initialDate : today());
  const [amount, setAmount] = useState(
    props.mode === "edit" ? String(props.initialAmount) : "",
  );
  const [note, setNote] = useState(props.mode === "edit" ? props.initialNote : "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Pick a valid date.");
      return;
    }
    startTransition(async () => {
      const res =
        props.mode === "edit"
          ? await updateCashDeposit({ id: props.id, date, amount: n, note: note.trim() })
          : await addCashDeposit({ date, amount: n, note: note.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(props.mode === "edit" ? "Deposit updated" : "Deposit recorded");
      setOpen(false);
      if (props.mode === "add") {
        setAmount("");
        setNote("");
        setDate(today());
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          props.mode === "edit" ? (
            <Button type="button" size="sm" variant="outline">
              <Pencil className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:ml-1">Edit</span>
            </Button>
          ) : (
            <Button type="button">
              <Plus className="mr-2 h-4 w-4" />
              Record a cash deposit
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {props.mode === "edit" ? "Edit cash deposit" : "Record a cash deposit"}
          </DialogTitle>
          <DialogDescription>
            Moves this amount out of Cash in hand and into Bank / UPI on the date
            below — for when you physically deposit cash at the bank.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="cd-date">Date</Label>
              <Input
                id="cd-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cd-amount">Amount (₹)</Label>
              <Input
                id="cd-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cd-note">Note (optional)</Label>
            <Textarea
              id="cd-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. deposited at SBI branch"
            />
          </div>
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
