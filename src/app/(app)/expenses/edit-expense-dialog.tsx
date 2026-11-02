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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money } from "@/lib/format";
import { updateExpense } from "./actions";

type Mode = "Cash" | "UPI";

const SUGGESTED = [
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

type Props = {
  id: string;
  date: string;
  category: string;
  note: string | null;
  amount: number;
  mode: Mode;
};

/** Correct a saved expense (date, category, note, amount, paid by). */
export function EditExpenseDialog(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(props.date);
  const [category, setCategory] = useState(props.category);
  const [note, setNote] = useState(props.note ?? "");
  const [amount, setAmount] = useState(String(props.amount));
  const [mode, setMode] = useState<Mode>(props.mode);

  // Start from the saved values every time the dialog opens.
  function onOpenChange(next: boolean) {
    if (next) {
      setDate(props.date);
      setCategory(props.category);
      setNote(props.note ?? "");
      setAmount(String(props.amount));
      setMode(props.mode);
    }
    setOpen(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!category.trim() || !Number.isFinite(n) || n <= 0) {
      toast.error("Enter a category and a positive amount.");
      return;
    }
    startTransition(async () => {
      const res = await updateExpense({
        id: props.id,
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
      toast.success(`Expense updated · ${money(n)}`);
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
          <DialogTitle>Edit expense</DialogTitle>
          <DialogDescription>
            Fix the date, category, note, amount or how it was paid. The Daily ledger and Profit
            update to match.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`ee-date-${props.id}`}>Date</Label>
              <Input
                id={`ee-date-${props.id}`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`ee-cat-${props.id}`}>Category</Label>
              <Input
                id={`ee-cat-${props.id}`}
                list={`ee-cat-list-${props.id}`}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                autoComplete="off"
              />
              <datalist id={`ee-cat-list-${props.id}`}>
                {SUGGESTED.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ee-note-${props.id}`}>Note</Label>
            <Input
              id={`ee-note-${props.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Vehicle no, vendor name, etc."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`ee-amt-${props.id}`}>Amount (₹)</Label>
              <Input
                id={`ee-amt-${props.id}`}
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Paid by</Label>
              <Select value={mode} onValueChange={(v) => setMode((v as Mode) ?? "Cash")}>
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
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
