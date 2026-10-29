"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AmountInput } from "@/components/ui/amount-input";
import { money } from "@/lib/format";
import { updatePattiPayment } from "./actions";

type Mode = "Cash" | "UPI" | "CJ";

type Props = {
  id: string;
  /** e.g. "P 03" / "GP 02" — shown in the title. */
  billLabel: string;
  party: string;
  amount: number;
  mode: Mode;
  date: string;
  note: string | null;
};

/** Correct a recorded purchase payment (amount, mode, date, note). */
export function EditPattiPaymentDialog(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(String(props.amount));
  const [mode, setMode] = useState<Mode>(props.mode);
  const [date, setDate] = useState(props.date);
  const [note, setNote] = useState(props.note ?? "");

  // Start from the saved values every time the dialog opens.
  function onOpenChange(next: boolean) {
    if (next) {
      setAmount(String(props.amount));
      setMode(props.mode);
      setDate(props.date);
      setNote(props.note ?? "");
    }
    setOpen(next);
  }

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
      const res = await updatePattiPayment({
        id: props.id,
        amount: n,
        mode,
        date,
        note: note.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Payment updated · ${money(n)} (${mode})`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" size="icon-sm" variant="outline" title="Edit">
            <Pencil className="h-3.5 w-3.5" />
            <span className="sr-only">Edit</span>
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit payment · {props.billLabel} · {props.party}
          </DialogTitle>
          <DialogDescription>
            Fix the amount, mode, date or note. The purchase bill&apos;s balance and the Daily
            ledger update to match.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <AmountInput
            id="ep-amount"
            label="Amount paid (₹)"
            value={amount}
            onChange={setAmount}
            autoFocus
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Mode</label>
              <Select value={mode} onValueChange={(v) => setMode((v as Mode) ?? "Cash")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => (v as string) ?? "Cash"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash" label="Cash">Cash</SelectItem>
                  <SelectItem value="UPI" label="UPI">UPI</SelectItem>
                  <SelectItem value="CJ" label="CJ">CJ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="ep-date">Date paid</label>
              <Input
                id="ep-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="ep-note">
              Note (optional)
            </label>
            <Textarea
              id="ep-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
