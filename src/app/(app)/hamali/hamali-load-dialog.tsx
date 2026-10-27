"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/format";
import { addHamaliLoad, updateHamaliLoad } from "./actions";

type Props =
  | {
      mode: "add";
      date: string;
    }
  | {
      mode: "edit";
      id: string;
      initialDate: string;
      initialBags: number;
      initialRatePerBag: number;
      initialNote: string;
    };

export function HamaliLoadDialog(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(
    props.mode === "edit" ? props.initialDate : props.date,
  );
  const [bags, setBags] = useState(
    props.mode === "edit" ? String(props.initialBags) : "",
  );
  const [rate, setRate] = useState(
    props.mode === "edit" ? String(props.initialRatePerBag) : "",
  );
  const [note, setNote] = useState(props.mode === "edit" ? props.initialNote : "");

  const bagsNum = Number(bags);
  const rateNum = Number(rate);
  const amount =
    Number.isFinite(bagsNum) && Number.isFinite(rateNum) ? bagsNum * rateNum : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isInteger(bagsNum) || bagsNum <= 0) {
      toast.error("Enter a valid number of bags.");
      return;
    }
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      toast.error("Enter a valid rate per bag.");
      return;
    }
    startTransition(async () => {
      const res =
        props.mode === "edit"
          ? await updateHamaliLoad({
              id: props.id,
              date,
              bags: bagsNum,
              ratePerBag: rateNum,
              note: note.trim(),
            })
          : await addHamaliLoad({
              date,
              bags: bagsNum,
              ratePerBag: rateNum,
              note: note.trim(),
            });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(props.mode === "edit" ? "Hamali load updated" : "Hamali load recorded");
      setOpen(false);
      if (props.mode === "add") {
        setBags("");
        setRate("");
        setNote("");
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          props.mode === "edit" ? (
            <Button type="button" size="icon-sm" variant="outline" title="Edit">
              <Pencil className="h-3.5 w-3.5" />
              <span className="sr-only">Edit</span>
            </Button>
          ) : (
            <Button type="button">
              <Plus className="mr-2 h-4 w-4" />
              Record hamali for a load
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {props.mode === "edit" ? "Edit hamali load entry" : "Record hamali for a load"}
          </DialogTitle>
          <DialogDescription>
            For unloading an incoming load — set the rate per bag and number of bags. This
            just records it; it&apos;s paid together with the day&apos;s loaded hamali in
            one combined payment at day&apos;s end.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="hl-date">Date</Label>
              <Input
                id="hl-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hl-bags">No. of bags</Label>
              <Input
                id="hl-bags"
                type="number"
                min="1"
                step="1"
                value={bags}
                onChange={(e) => setBags(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hl-rate">₹ / bag</Label>
              <Input
                id="hl-rate"
                type="number"
                min="0"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="hl-note">Note (optional)</Label>
            <Textarea
              id="hl-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. truck no. / supplier"
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
