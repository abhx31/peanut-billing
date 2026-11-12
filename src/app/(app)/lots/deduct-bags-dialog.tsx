"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MinusCircle } from "lucide-react";
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
import { Field } from "@/components/form";
import { deductBags } from "./actions";

/**
 * Take bags out of this store's stock without a sale — damaged, shortage,
 * used, given away. Recorded for today and shown on the Stock page.
 */
export function DeductBagsDialog({
  lotId,
  lotName,
  left,
  storeName,
}: {
  lotId: string;
  lotName: string;
  left: number;
  storeName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [bags, setBags] = useState("");

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) setBags("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.floor(Number(bags));
    if (!n || n <= 0) {
      toast.error("Enter the bags to deduct.");
      return;
    }
    if (n > left && !confirm(`Only ${left} bags left at ${storeName}. Deduct ${n} anyway?`)) {
      return;
    }
    startTransition(async () => {
      const res = await deductBags({ lotId, bags: n });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Deducted ${n} bags of ${lotName}`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline" title="Deduct bags">
            <MinusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Deduct</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deduct bags from &quot;{lotName}&quot;</DialogTitle>
          <DialogDescription>
            Takes bags out of {storeName}&apos;s stock without a sale. {left} bags left here now.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Bags to deduct" htmlFor="dd-bags" required>
            <Input
              id="dd-bags"
              type="number"
              min="1"
              step="1"
              value={bags}
              onChange={(e) => setBags(e.target.value)}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Deduct"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
