"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote } from "lucide-react";
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
import { money, today } from "@/lib/format";
import { addCjSettlement } from "./actions";

export function CjSettlementForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"Cash" | "UPI">("Cash");
  const [note, setNote] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) {
      toast.error("Enter the amount CJ gave you.");
      return;
    }
    startTransition(async () => {
      const res = await addCjSettlement({
        date,
        amount: n,
        mode,
        note: note.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Recorded ${money(n)} received from CJ (${mode})`);
      setAmount("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border bg-muted/30 p-4 space-y-5"
    >
      <FormGrid cols={4}>
        <Field label="Date" htmlFor="cj-date" required>
          <Input
            id="cj-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Amount CJ gave you (₹)" htmlFor="cj-amount" required>
          <Input
            id="cj-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="You received it as" required>
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
        <Field label="Note" htmlFor="cj-note" hint="Optional reference.">
          <Input id="cj-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </FormGrid>
      <FormActions>
        <Button type="submit" disabled={pending}>
          <Banknote className="mr-2 h-4 w-4" />
          {pending ? "Saving…" : "Record settlement"}
        </Button>
      </FormActions>
    </form>
  );
}
