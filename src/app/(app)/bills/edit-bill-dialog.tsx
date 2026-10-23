"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money, num, pad2, parseBagWeights, r2 } from "@/lib/format";
import { editBill } from "./edit-actions";

type Lot = { id: string; name: string; left: number };

type Line = {
  id: string;
  lotId: string;
  lotName: string;
  bags: number;
  kg: number;
  rate: number;
  weightsText: string | null;
};

type Row = {
  key: string;
  itemId?: string; // present = existing line; absent = new line added here
  lotId: string;
  bagsStr: string;
  kgStr: string;
  rateStr: string;
  weightsText: string;
};

type Props = {
  billId: string;
  billNo: number;
  billDate: string;
  customer: string;
  hamaliPerBag: number;
  items: Line[];
  lots: Lot[];
};

export function EditBillDialog({
  billId,
  billNo,
  billDate,
  customer,
  hamaliPerBag,
  items,
  lots,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(billDate);
  const [customerName, setCustomerName] = useState(customer);
  const [hamali, setHamali] = useState(String(hamaliPerBag));
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((it) => ({
      key: it.id,
      itemId: it.id,
      lotId: it.lotId,
      bagsStr: String(it.bags),
      kgStr: String(it.kg),
      rateStr: String(it.rate),
      weightsText: it.weightsText ?? "",
    })),
  );

  // Staging area for a new line, same pattern as the create-bill cart.
  const [newLotId, setNewLotId] = useState(lots[0]?.id ?? "");
  const [newBags, setNewBags] = useState("");
  const [newKg, setNewKg] = useState("");
  const [newRate, setNewRate] = useState("");
  const [newWeights, setNewWeights] = useState("");

  function onNewWeights(v: string) {
    setNewWeights(v);
    const p = parseBagWeights(v);
    if (p.count > 0) {
      setNewBags(String(p.count));
      setNewKg(String(p.totalKg));
    }
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  function removeRow(key: string) {
    setRows((xs) => xs.filter((x) => x.key !== key));
  }

  function addLine() {
    const bagsN = num(newBags);
    const kgN = num(newKg);
    const rateN = num(newRate);
    if (!newLotId || bagsN <= 0 || kgN <= 0 || rateN <= 0) {
      toast.error("Pick a lot and enter bags, weight and price before adding.");
      return;
    }
    setRows((xs) => [
      ...xs,
      {
        key: crypto.randomUUID(),
        lotId: newLotId,
        bagsStr: newBags,
        kgStr: newKg,
        rateStr: newRate,
        weightsText: newWeights.trim(),
      },
    ]);
    setNewBags("");
    setNewKg("");
    setNewRate("");
    setNewWeights("");
  }

  const calc = useMemo(() => {
    const totalBags = rows.reduce((s, r) => s + (num(r.bagsStr) || 0), 0);
    const amount = r2(
      rows.reduce((s, r) => s + (num(r.kgStr) || 0) * (num(r.rateStr) || 0), 0),
    );
    const hamaliTotal = r2(totalBags * (num(hamali) || 0));
    const total = Math.round(amount + hamaliTotal);
    return { totalBags, amount, hamaliTotal, total };
  }, [rows, hamali]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCustomer = customerName.trim();
    if (!trimmedCustomer) {
      toast.error("Customer name cannot be empty.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Pick a valid date.");
      return;
    }
    if (rows.length === 0) {
      toast.error("A bill needs at least one lot.");
      return;
    }
    for (const r of rows) {
      if (!r.lotId || num(r.bagsStr) <= 0 || num(r.kgStr) <= 0 || num(r.rateStr) <= 0) {
        toast.error("Every line needs a lot, bags, weight and price.");
        return;
      }
    }

    // Soft stock warning, mirroring the create-bill form. This bill's own
    // current bags are already "reserved" in lot.left's complement, so add
    // them back before comparing against what's being asked for now.
    const neededByLot = new Map<string, { name: string; need: number; already: number }>();
    for (const r of rows) {
      const entry = neededByLot.get(r.lotId) ?? {
        name: lots.find((l) => l.id === r.lotId)?.name ?? "",
        need: 0,
        already: 0,
      };
      entry.need += num(r.bagsStr);
      neededByLot.set(r.lotId, entry);
    }
    for (const it of items) {
      const entry = neededByLot.get(it.lotId);
      if (entry) entry.already += it.bags;
    }
    for (const [lotId, { name, need, already }] of neededByLot) {
      const lot = lots.find((l) => l.id === lotId);
      const available = (lot?.left ?? 0) + already;
      if (need > available) {
        if (!confirm(`Only ${available} bags of "${name}" available. Save anyway?`)) {
          return;
        }
      }
    }

    startTransition(async () => {
      const res = await editBill({
        billId,
        date,
        customer: trimmedCustomer,
        hamaliPerBag: num(hamali),
        items: rows.map((r) => ({
          itemId: r.itemId,
          lotId: r.lotId,
          bags: num(r.bagsStr),
          kg: num(r.kgStr),
          rate: num(r.rateStr),
          weightsText: r.weightsText,
        })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Bill updated");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            <Pencil className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Edit</span>
          </Button>
        }
      />
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit bill #{pad2(billNo)}</DialogTitle>
          <DialogDescription>
            Change the date, customer, hamali, or any lot line — lot, bags,
            weight or price. Add or remove lines too. Payments stay as
            recorded; use Receive or the receipt actions for those.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="eb-date">Date</Label>
              <Input
                id="eb-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eb-cust">Customer</Label>
              <Input
                id="eb-cust"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eb-hamali">Hamali per bag (₹)</Label>
              <Input
                id="eb-hamali"
                type="number"
                min="0"
                step="0.5"
                value={hamali}
                onChange={(e) => setHamali(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.key} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Lot / quality</Label>
                    <Select
                      value={r.lotId}
                      onValueChange={(v) => updateRow(r.key, { lotId: v ?? r.lotId })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v) => lots.find((l) => l.id === v)?.name ?? "Pick a lot"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {lots.map((l) => (
                          <SelectItem key={l.id} value={l.id} label={l.name}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`eb-bags-${r.key}`}>Bags</Label>
                    <Input
                      id={`eb-bags-${r.key}`}
                      type="number"
                      min="0"
                      step="1"
                      value={r.bagsStr}
                      onChange={(e) => updateRow(r.key, { bagsStr: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`eb-kg-${r.key}`}>Weight (kg)</Label>
                    <Input
                      id={`eb-kg-${r.key}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={r.kgStr}
                      onChange={(e) => updateRow(r.key, { kgStr: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`eb-rate-${r.key}`}>Price per kg (₹)</Label>
                    <Input
                      id={`eb-rate-${r.key}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={r.rateStr}
                      onChange={(e) => updateRow(r.key, { rateStr: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    Line amount:{" "}
                    {money(r2((num(r.kgStr) || 0) * (num(r.rateStr) || 0)))}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => removeRow(r.key)}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No lines left — add at least one below before saving.
              </p>
            )}
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-sm font-medium">+ Add another lot</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Lot / quality</Label>
                <Select value={newLotId} onValueChange={(v) => setNewLotId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => {
                        const l = lots.find((x) => x.id === v);
                        return l ? `${l.name} (${l.left} left)` : "Pick a lot";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {lots.map((l) => (
                      <SelectItem key={l.id} value={l.id} label={`${l.name} (${l.left} left)`}>
                        {l.name} ({l.left} left)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="eb-new-bags">Bags</Label>
                <Input
                  id="eb-new-bags"
                  type="number"
                  min="0"
                  step="1"
                  value={newBags}
                  onChange={(e) => setNewBags(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="eb-new-kg">Weight (kg)</Label>
                <Input
                  id="eb-new-kg"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newKg}
                  onChange={(e) => setNewKg(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="eb-new-rate">Price per kg (₹)</Label>
                <Input
                  id="eb-new-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="eb-new-weights">Each bag&apos;s weight (optional)</Label>
                <Textarea
                  id="eb-new-weights"
                  rows={2}
                  value={newWeights}
                  onChange={(e) => onNewWeights(e.target.value)}
                  placeholder="40.5 41 50x40.5"
                />
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              + Add line
            </Button>
          </div>

          <div className="rounded-md bg-muted/60 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Goods amount</span>
              <span className="tabular-nums">{money(calc.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Hamali ({calc.totalBags} bags)
              </span>
              <span className="tabular-nums">{money(calc.hamaliTotal)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>New total</span>
              <span className="tabular-nums">{money(calc.total)}</span>
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
