"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FormActions, FormGrid } from "@/components/form";
import { today } from "@/lib/format";
import { addTransfer } from "./actions";

type Lot = { id: string; name: string; stkM: number; stkN: number };

export function TransferForm({ lots }: { lots: Lot[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lotId, setLotId] = useState(lots[0]?.id ?? "");
  const [bags, setBags] = useState("");
  const [dir, setDir] = useState<"out" | "back">("out");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");

  const selected = useMemo(() => lots.find((l) => l.id === lotId), [lots, lotId]);
  const available = selected ? (dir === "out" ? selected.stkM : selected.stkN) : 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(bags);
    if (!selected || !n || n <= 0) {
      toast.error("Pick a lot and enter the bags.");
      return;
    }
    if (
      n > available &&
      !confirm(
        `Only ${available} bags available at the ${dir === "out" ? "Main store" : "New Mahavir"}. Continue anyway?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await addTransfer({
        lotId: selected.id,
        bags: Math.floor(n),
        dir,
        date,
        note: note.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${dir === "out" ? "Sent" : "Returned"} ${n} bags of ${selected.name}`);
      setBags("");
      setNote("");
      router.refresh();
    });
  }

  if (lots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Add a lot first before transferring.</p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormGrid cols={3}>
        <Field label="Lot / quality" required span={2}>
          <Select value={lotId} onValueChange={(v) => setLotId(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a lot">
                {(v) => {
                  const l = lots.find((x) => x.id === v);
                  return l ? `${l.name} · Main ${l.stkM} · NM ${l.stkN}` : "Pick a lot";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {lots.map((l) => (
                <SelectItem
                  key={l.id}
                  value={l.id}
                  label={`${l.name} · Main ${l.stkM} · NM ${l.stkN}`}
                >
                  {l.name} · Main {l.stkM} · NM {l.stkN}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Direction" required>
          <Select
            value={dir}
            onValueChange={(v) => setDir(((v as "out" | "back") ?? "out"))}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v) =>
                  v === "back"
                    ? "New Mahavir → Main (return)"
                    : "Main store → New Mahavir"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="out" label="Main → New Mahavir">
                Main store → New Mahavir
              </SelectItem>
              <SelectItem value="back" label="New Mahavir → Main (return)">
                New Mahavir → Main (return)
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date" htmlFor="xf-date" required>
          <Input
            id="xf-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field
          label="Bags"
          htmlFor="xf-bags"
          required
          hint={
            selected
              ? `Available at ${dir === "out" ? "Main store" : "New Mahavir"}: ${available}`
              : undefined
          }
        >
          <Input
            id="xf-bags"
            type="number"
            min="0"
            step="1"
            value={bags}
            onChange={(e) => setBags(e.target.value)}
          />
        </Field>
        <Field label="Vehicle / note" htmlFor="xf-note" span={2}>
          <Input
            id="xf-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. KA-19 PY-2847"
          />
        </Field>
      </FormGrid>
      <FormActions>
        <Button type="submit" disabled={pending}>
          <ArrowLeftRight className="mr-2 h-4 w-4" />
          {pending ? "Saving…" : "Transfer"}
        </Button>
      </FormActions>
    </form>
  );
}
