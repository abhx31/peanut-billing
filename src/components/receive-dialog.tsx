"use client";

import { useState, useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AmountInput } from "@/components/ui/amount-input";
import { money, today } from "@/lib/format";

type Mode = "Cash" | "UPI" | "CJ";
type Action = (input: {
  amount: number;
  mode: Mode;
  date: string;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

type Props = {
  trigger?: React.ReactElement;
  title: string;
  description?: string;
  defaultAmount?: number;
  balance: number;
  onConfirm: Action;
  size?: "sm" | "default";
  /** When true, the Mode dropdown includes CJ (customer paid through the go-between). */
  allowCj?: boolean;
};

export function ReceiveDialog({
  trigger,
  title,
  description,
  defaultAmount,
  balance,
  onConfirm,
  size = "sm",
  allowCj = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [mode, setMode] = useState<Mode>("Cash");
  const [date, setDate] = useState(today());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Pick a valid date.");
      return;
    }
    startTransition(async () => {
      const res = await onConfirm({ amount: n, mode, date });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Received ${money(n)} (${mode}) on ${date}`);
      // Hard reload — see ReceiveDueDialog for why we don't rely on
      // router.refresh here. The user never sees the dialog's state
      // mutation because the page reloads immediately.
      window.location.reload();
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Mode</label>
              <Select value={mode} onValueChange={(v) => setMode((v as Mode) ?? "Cash")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => (v as string) ?? "Cash"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash" label="Cash">Cash</SelectItem>
                  <SelectItem value="UPI" label="UPI">UPI</SelectItem>
                  {allowCj && (
                    <SelectItem value="CJ" label="CJ">CJ</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="receive-date">
                Date received
              </label>
              <Input
                id="receive-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
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
