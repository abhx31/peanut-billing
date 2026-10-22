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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description?: string;
  label: string;
  trigger: React.ReactElement;
  defaultValue?: string;
  maxLength?: number;
  confirmLabel?: string;
  successMessage?: string;
  onConfirm: (value: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function TextPromptDialog({
  title,
  description,
  label,
  trigger,
  defaultValue = "",
  maxLength = 120,
  confirmLabel = "Save",
  successMessage,
  onConfirm,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(defaultValue);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      toast.error("This can't be empty.");
      return;
    }
    startTransition(async () => {
      const res = await onConfirm(trimmed);
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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setValue(defaultValue);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="text-prompt">{label}</Label>
            <Input
              id="text-prompt"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={maxLength}
              autoFocus
            />
          </div>
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
