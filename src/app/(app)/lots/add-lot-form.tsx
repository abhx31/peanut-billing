"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormActions, FormGrid } from "@/components/form";
import { addLot } from "./actions";

export function AddLotForm({
  isOwner,
  storeName,
}: {
  isOwner: boolean;
  storeName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [bags, setBags] = useState("");
  const [cost, setCost] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a lot name.");
      return;
    }
    startTransition(async () => {
      const res = await addLot({
        name: trimmed,
        bags: bags ? Number(bags) : 0,
        costPerKg: isOwner && cost ? Number(cost) : null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added lot "${trimmed}"`);
      setName("");
      setBags("");
      setCost("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormGrid cols={isOwner ? 3 : 2}>
        <Field
          label="Lot no. / quality name"
          htmlFor="lot-name"
          required
          span={isOwner ? 1 : 2}
        >
          <Input
            id="lot-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lot 12 – Bold 40/50"
          />
        </Field>
        <Field
          label="Bags"
          htmlFor="lot-bags"
          hint={`Lands at ${storeName}. Switch stores from the Working-at bar at the top to add stock elsewhere.`}
        >
          <Input
            id="lot-bags"
            type="number"
            min="0"
            step="1"
            value={bags}
            onChange={(e) => setBags(e.target.value)}
          />
        </Field>
        {isOwner && (
          <Field
            label="Cost per kg (₹)"
            htmlFor="lot-cost"
            hint="Owner-only — used to compute profit. Visible to owners and editors."
          >
            <Input
              id="lot-cost"
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </Field>
        )}
      </FormGrid>
      <FormActions>
        <Button type="submit" disabled={pending}>
          <Plus className="mr-2 h-4 w-4" />
          {pending ? "Adding…" : "Add lot"}
        </Button>
      </FormActions>
    </form>
  );
}
