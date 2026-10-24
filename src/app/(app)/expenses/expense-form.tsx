"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FormActions, FormGrid } from "@/components/form";
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
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Expense added");
      setCategory("");
      setNote("");
      setAmount("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormGrid cols={3}>
        <Field label="Date" htmlFor="xd" required>
          <Input
            id="xd"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Category" htmlFor="xc" required>
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
        </Field>
        <Field label="Note" htmlFor="xn" hint="Optional context like a vehicle no. or vendor name.">
          <Input id="xn" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Amount (₹)" htmlFor="xa" required>
          <Input
            id="xa"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Paid by" required>
          <Select
            value={mode}
            onValueChange={(v) => setMode((v as "Cash" | "UPI") ?? "Cash")}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{(v) => (v as string) ?? "Cash"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Cash" label="Cash">Cash</SelectItem>
              <SelectItem value="UPI" label="UPI">UPI</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FormGrid>
      <FormActions>
        <Button type="submit" disabled={pending}>
          <Plus className="mr-2 h-4 w-4" />
          {pending ? "Adding…" : "Add expense"}
        </Button>
      </FormActions>
    </form>
  );
}
