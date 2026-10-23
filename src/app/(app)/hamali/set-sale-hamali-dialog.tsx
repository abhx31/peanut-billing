"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { money, num } from "@/lib/format";
import { setSaleHamali } from "./actions";

type Props = { billId: string; label: string; bags: number };

export function SetSaleHamaliDialog({ billId, label, bags }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [rate, setRate] = useState("10");

  const rateNum = num(rate);
  const amount = Number.isFinite(rateNum) ? bags * rateNum : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      toast.error("Enter a valid rate per bag.");
      return;
    }
    startTransition(async () => {
      const res = await setSaleHamali({ billId, ratePerBag: rateNum });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Hamali set for ${label}`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add hamali
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add hamali — {label}</DialogTitle>
          <DialogDescription>
            {bags} bags, on us — not billed to the customer. Doesn&apos;t change this
            bill&apos;s total or balance, only adds it to the Hamali tab.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="ssh-rate">₹ / bag</Label>
            <Input
              id="ssh-rate"
              type="number"
              min="0"
              step="0.5"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              autoFocus
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Total hamali: <b>{money(amount)}</b>
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
