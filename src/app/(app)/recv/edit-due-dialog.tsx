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
import { editOldDue } from "./actions";

type Props = { id: string; customer: string; amount: number };

export function EditDueDialog({ id, customer, amount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(amount));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!n || n <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    startTransition(async () => {
      const res = await editOldDue({ id, amount: n });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Old due updated");
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
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct old due</DialogTitle>
          <DialogDescription>{customer}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="od-edit-amt">Amount due (₹)</Label>
            <Input
              id="od-edit-amt"
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
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
