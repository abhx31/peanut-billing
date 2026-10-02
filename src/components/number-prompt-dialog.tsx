"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description?: string;
  label: string;
  trigger: React.ReactElement;
  defaultValue?: number | string;
  min?: string;
  step?: string;
  confirmLabel?: string;
  successMessage?: string;
  onConfirm: (value: number) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function NumberPromptDialog({
  title,
  description,
  label,
  trigger,
  defaultValue,
  min = "0",
  step = "0.01",
  confirmLabel = "Save",
  successMessage,
  onConfirm,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(defaultValue !== undefined ? String(defaultValue) : "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isFinite(n) || n < Number(min || 0)) {
      toast.error("Enter a valid number.");
      return;
    }
    startTransition(async () => {
      const res = await onConfirm(n);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (successMessage) toast.success(successMessage);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <AmountInput
            id="number-prompt"
            label={label}
            value={value}
            onChange={setValue}
            autoFocus
            min={min}
            step={step}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
