"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addExpense } from "./actions";

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

export function ExpenseForm({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(defaultDate);
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"Cash" | "UPI">("Cash");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!category.trim() || !Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a category and a positive amount.");
      return;
    }
    startTransition(async () => {
      const res = await addExpense({
        date,
        category: category.trim(),
        note: note.trim(),
        amount: amt,
        mode,
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Expense added");
      setCategory("");
      setNote("");
      setAmount("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
      <div className="space-y-2">
        <Label htmlFor="xd">Date</Label>
        <Input id="xd" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="xc">Category</Label>
        <Input
          id="xc"
          list="xcl"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Transport"
          autoComplete="off"
        />
        <datalist id="xcl">
          {SUGGESTED.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor="xn">Note</Label>
        <Input id="xn" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="xa">Amount (₹)</Label>
        <Input
          id="xa"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Paid by</Label>
        <Select value={mode} onValueChange={(v) => setMode((v as "Cash" | "UPI") ?? "Cash")}>
          <SelectTrigger className="w-full">
            <SelectValue>{(v) => (v as string) ?? "Cash"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Cash" label="Cash">Cash</SelectItem>
            <SelectItem value="UPI" label="UPI">UPI</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2 lg:col-span-5">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add expense"}
        </Button>
      </div>
    </form>
  );
}
