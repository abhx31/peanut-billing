"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleDollarSign } from "lucide-react";
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
import { money, today } from "@/lib/format";
import { payPattiBill } from "./actions";

type Mode = "Cash" | "UPI" | "CJ";

type Props = {
  pattiId: string;
  party: string;
  net: number;
  paid: number;
};

export function PayPattiDialog({ pattiId, party, net, paid }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const balance = Math.max(0, net - paid);
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : "");
  const [mode, setMode] = useState<Mode>("Cash");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");

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
    if (n > balance + 0.5 && !confirm(`This is more than the ${money(balance)} still owed. Save anyway?`)) {
      return;
    }
    startTransition(async () => {
      const res = await payPattiBill({ pattiId, amount: n, mode, date, note: note.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Recorded ${money(n)} (${mode}) toward ${party}`);
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setAmount(balance > 0 ? String(balance) : "");
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            <CircleDollarSign className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:ml-1">
              {balance > 0.5 ? "Pay" : "Paid"}
            </span>
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay {party}</DialogTitle>
          <DialogDescription>
            Net {money(net)} · Paid so far {money(paid)} · Owed {money(balance)}.
            Record this payment however it actually happened — split across
            Cash, UPI and CJ over as many days as it takes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <AmountInput
            id="pp-amount"
            label="Amount paid now (₹)"
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
              <label className="text-sm font-medium" htmlFor="pp-date">Date paid</label>
              <Input
                id="pp-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          {mode === "CJ" && (
            <p className="text-xs text-muted-foreground">
              CJ paying the supplier directly reduces the CJ-held balance, same as a
              normal CJ settlement — it doesn&apos;t touch your own Cash or Bank.
            </p>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="pp-note">
              Note (optional)
            </label>
            <Textarea
              id="pp-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. part payment via driver"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
