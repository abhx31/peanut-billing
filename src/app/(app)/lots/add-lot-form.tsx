"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addLot } from "./actions";

export function AddLotForm({ isOwner }: { isOwner: boolean }) {
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
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
      <div className="sm:col-span-2 space-y-2">
        <Label htmlFor="lot-name">Lot no. / quality name</Label>
        <Input
          id="lot-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lot 12 – Bold 40/50"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lot-bags">Bags (opening stock)</Label>
        <Input
          id="lot-bags"
          type="number"
          min="0"
          step="1"
          value={bags}
          onChange={(e) => setBags(e.target.value)}
        />
      </div>
      {isOwner && (
        <div className="space-y-2">
          <Label htmlFor="lot-cost">Cost per kg (₹)</Label>
          <Input
            id="lot-cost"
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>
      )}
      <div className={isOwner ? "sm:col-span-2 lg:col-span-4" : "sm:col-span-2 lg:col-span-3"}>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add lot"}
        </Button>
      </div>
    </form>
  );
}
