"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Undo2 } from "lucide-react";
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
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { fmtDate, money } from "@/lib/format";
import { payHamali, undoHamaliPayment } from "./actions";

type PayProps = { date: string; bags: number; amount: number };

export function HamaliPayDialog({ date, bags, amount }: PayProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [input, setInput] = useState(String(amount));
  const [mode, setMode] = useState<"Cash" | "UPI">("Cash");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(input);
    if (!n || n <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    startTransition(async () => {
      const res = await payHamali({ date, amount: n, mode });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Hamali paid ${money(n)} (${mode})`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Record hamali payment
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hamali payment</DialogTitle>
          <DialogDescription>
            {bags} bags · hamali {money(amount)} on {fmtDate(date)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ham-amt">Amount paid (₹)</Label>
            <Input
              id="ham-amt"
              type="number"
              min="0"
              step="0.01"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Paid by</Label>
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

export function HamaliUndoButton({ date }: { date: string }) {
  return (
    <ConfirmDestructive
      title="Undo hamali payment?"
      description="Removes the matching expense entry and the paid record. Your cash/UPI balance goes back up by this amount on that day."
      confirmLabel="Undo payment"
      successMessage="Hamali payment undone"
      onConfirm={() => undoHamaliPayment({ date })}
      trigger={
        <Button type="button" variant="outline">
          <Undo2 className="mr-2 h-4 w-4" />
          Undo payment
        </Button>
      }
    />
  );
}
