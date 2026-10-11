"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownToLine } from "lucide-react";
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
import { receiveOnDue } from "./actions";

type Mode = "Cash" | "UPI" | "CJ";

type Props = { id: string; customer: string; due: number };

export function ReceiveDueDialog({ id, customer, due }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(String(due));
  const [mode, setMode] = useState<Mode>("Cash");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    startTransition(async () => {
      const res = await receiveOnDue({ id, amount: n, mode });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Received ${money(n)} from ${customer}`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            <ArrowDownToLine className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Receive</span>
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive against old due</DialogTitle>
          <DialogDescription>
            {customer} · old due balance <b>{money(due)}</b>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="od-pay-amt">Amount received (₹)</Label>
            <Input
              id="od-pay-amt"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Received as</Label>
            <Select value={mode} onValueChange={(v) => setMode((v as Mode) ?? "Cash")}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v) => (v as string) ?? "Cash"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash" label="Cash">Cash</SelectItem>
                <SelectItem value="UPI" label="UPI">UPI</SelectItem>
                <SelectItem value="CJ" label="CJ">CJ (go-between)</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
