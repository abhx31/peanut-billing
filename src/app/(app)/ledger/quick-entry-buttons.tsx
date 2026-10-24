"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money } from "@/lib/format";
import { receiveFromCustomer } from "../bills/actions";
import { addExpense } from "../expenses/actions";

type Mode = "Cash" | "UPI" | "CJ";
type ExpMode = "Cash" | "UPI";

const EXP_SUGGESTIONS = [
  "Hamali / labour",
  "Transport",
  "Rent",
  "Salary",
  "Electricity",
  "Packing / bags",
  "Tea & food",
  "Repairs",
  "Other",
];

export function ReceiveQuickButton({
  defaultDate,
  customerNames,
}: {
  defaultDate: string;
  customerNames: string[];
}) {

  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<Mode>("Cash");
  const [date, setDate] = useState(defaultDate);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!customer.trim() || !Number.isFinite(n) || n <= 0) {
      toast.error("Enter a customer and a positive amount.");
      return;
    }
    startTransition(async () => {
      const res = await receiveFromCustomer({
        customer: customer.trim(),
        amount: n,
        mode,
        date,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Received ${money(n)} from ${customer.trim()}`);
      setOpen(false);
      setCustomer("");
      setAmount("");
      // Hard reload so the ledger updates immediately — see ReceiveDueDialog.
      window.location.reload();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Money received
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Money received from a customer</DialogTitle>
          <DialogDescription>
            Old dues clear first, then the oldest unpaid bills. Anything left
            over is kept as an advance for this customer.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qr-cust">Customer</Label>
            <Input
              id="qr-cust"
              list="qr-cust-list"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Customer name"
              autoComplete="off"
              autoFocus
            />
            <datalist id="qr-cust-list">
              {customerNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="qr-amt">Amount (₹)</Label>
              <Input
                id="qr-amt"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qr-date">Date received</Label>
              <Input
                id="qr-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode((v as Mode) ?? "Cash")}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v) => (v as string) ?? "Cash"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash" label="Cash">Cash</SelectItem>
                <SelectItem value="UPI" label="UPI">UPI</SelectItem>
                <SelectItem value="CJ" label="CJ">CJ (go-between)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save receipt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseQuickButton({ defaultDate }: { defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(defaultDate);
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<ExpMode>("Cash");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!category.trim() || !Number.isFinite(n) || n <= 0) {
      toast.error("Enter a category and amount.");
      return;
    }
    startTransition(async () => {
      const res = await addExpense({
        date,
        category: category.trim(),
        note: note.trim(),
        amount: n,
        mode,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Expense added · ${money(n)}`);
      setOpen(false);
      setCategory("");
      setNote("");
      setAmount("");
      // Hard reload so the ledger updates immediately — see ReceiveDueDialog.
      window.location.reload();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Expense
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>
            Adds an expense for the store you are working at, on the chosen
            date. For Hamali payments use the Hamali tab (so the hm flag is
            set correctly).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="qe-date">Date</Label>
              <Input
                id="qe-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qe-cat">Category</Label>
              <Input
                id="qe-cat"
                list="qe-cat-list"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Transport"
                autoComplete="off"
                autoFocus
              />
              <datalist id="qe-cat-list">
                {EXP_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qe-note">Note</Label>
            <Input
              id="qe-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Vehicle no, vendor name, etc."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="qe-amt">Amount (₹)</Label>
              <Input
                id="qe-amt"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Paid by</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode((v as ExpMode) ?? "Cash")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => (v as string) ?? "Cash"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash" label="Cash">Cash</SelectItem>
                  <SelectItem value="UPI" label="UPI">UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
