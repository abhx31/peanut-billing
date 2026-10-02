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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AmountInput } from "@/components/ui/amount-input";
import { money } from "@/lib/format";

type Mode = "Cash" | "UPI";
type Action = (input: {
  amount: number;
  mode: Mode;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

type Props = {
  trigger?: React.ReactElement;
  title: string;
  description?: string;
  defaultAmount?: number;
  balance: number;
  onConfirm: Action;
  size?: "sm" | "default";
};

export function ReceiveDialog({
  trigger,
  title,
  description,
  defaultAmount,
  balance,
  onConfirm,
  size = "sm",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [mode, setMode] = useState<Mode>("Cash");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    startTransition(async () => {
      const res = await onConfirm({ amount: n, mode });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Received ${money(n)} (${mode})`);
      setOpen(false);
      setAmount("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size={size} variant="outline">
              <ArrowDownToLine className="mr-1 h-4 w-4" />
              Receive
            </Button>
          )
        }
      />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-md bg-muted/60 p-3 text-sm">
            Outstanding balance: <span className="font-semibold">{money(balance)}</span>
          </div>
          <AmountInput
            id="receive-amount"
            label="Amount received (₹)"
            value={amount}
            onChange={setAmount}
            autoFocus
          />
          <div className="space-y-2">
            <label className="text-sm font-medium">Mode</label>
            <Select value={mode} onValueChange={(v) => setMode((v as Mode) ?? "Cash")}>
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
              {pending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
