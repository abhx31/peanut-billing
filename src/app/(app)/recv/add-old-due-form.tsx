"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormActions, FormGrid } from "@/components/form";
import { today } from "@/lib/format";
import { addOldDue } from "./actions";

export function AddOldDueForm({ existingCustomers }: { existingCustomers: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!customer.trim() || !n || n <= 0) {
      toast.error("Enter the customer and the amount due.");
      return;
    }
    startTransition(async () => {
      const res = await addOldDue({
        customer: customer.trim(),
        amount: n,
        date,
        note: note.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added old due for ${customer.trim()}`);
      setCustomer("");
      setAmount("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormGrid cols={4}>
        <Field label="Customer" htmlFor="od-cust" required>
          <Input
            id="od-cust"
            list="od-cust-list"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            autoComplete="off"
          />
          <datalist id="od-cust-list">
            {existingCustomers.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Amount due (₹)" htmlFor="od-amt" required>
          <Input
            id="od-amt"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Due as of (start date)" htmlFor="od-date">
          <Input
            id="od-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Note" htmlFor="od-note" hint="Optional context.">
          <Input id="od-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </FormGrid>
      <FormActions>
        <Button type="submit" disabled={pending}>
          <Plus className="mr-2 h-4 w-4" />
          {pending ? "Adding…" : "Add old due"}
        </Button>
      </FormActions>
    </form>
  );
}
