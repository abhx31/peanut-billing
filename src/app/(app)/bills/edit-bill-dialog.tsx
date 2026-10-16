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
import { money, pad2, r2 } from "@/lib/format";
import { editBill } from "./edit-actions";

type Lot = { id: string; name: string };

type Line = {
  id: string;
  lotId: string;
  lotName: string;
  bags: number;
  kg: number;
  rate: number;
};

type Props = {
  billId: string;
  billNo: number;
  billDate: string;
  customer: string;
  items: Line[];
  lots: Lot[];
};

export function EditBillDialog({
  billId,
  billNo,
  billDate,
  customer,
  items,
  lots,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(
    items.map((it) => ({ ...it, rateStr: String(it.rate), lotIdCur: it.lotId })),
  );
  const [date, setDate] = useState(billDate);
  const [customerName, setCustomerName] = useState(customer);

  function update(id: string, patch: { rateStr?: string; lotIdCur?: string }) {
    setRows((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

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
    for (const r of rows) {
      const n = Number(r.rateStr);
      if (!n || n <= 0) {
        toast.error("Enter a positive price for every line.");
        return;
      }
    }
    startTransition(async () => {
      const res = await editBill({
        billId,
        date,
        customer: trimmedCustomer,
        items: rows.map((r) => ({
          itemId: r.id,
          lotId: r.lotIdCur,
          rate: Number(r.rateStr),
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

  const total = rows.reduce((s, r) => s + r2(r.kg * (Number(r.rateStr) || 0)), 0);

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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit bill #{pad2(billNo)}</DialogTitle>
          <DialogDescription>
            {customer} · change the lot or price per line. Bags, weight and payments stay
            the same.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="text-xs text-muted-foreground">
                  {r.bags} bags · {r2(r.kg)} kg
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Lot / quality</Label>
                    <Select
                      value={r.lotIdCur}
                      onValueChange={(v) => update(r.id, { lotIdCur: v ?? r.lotIdCur })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v) => {
                            const l = lots.find((x) => x.id === v);
                            return l?.name ?? r.lotName;
                          }}
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
                    <Label htmlFor={`eb-rate-${r.id}`}>Price per kg (₹)</Label>
                    <Input
                      id={`eb-rate-${r.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={r.rateStr}
                      onChange={(e) => update(r.id, { rateStr: e.target.value })}
                    />
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground tabular-nums">
                  Line amount: {money(r2(r.kg * (Number(r.rateStr) || 0)))}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-md bg-muted/60 p-3 text-sm flex justify-between">
            <span className="text-muted-foreground">New goods amount</span>
            <span className="font-semibold tabular-nums">{money(total)}</span>
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
