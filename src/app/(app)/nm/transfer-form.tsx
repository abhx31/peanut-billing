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
import { STOCK_LOCS, stockLocLabel, type StockLoc } from "@/lib/stock-loc";
import { addTransfer } from "./actions";

type Lot = { id: string; name: string; stkM: number; stkN: number; stkC: number };

const stockAt = (l: Lot, loc: StockLoc) => (loc === "NM" ? l.stkN : loc === "CS" ? l.stkC : l.stkM);

function PlaceSelect({
  value,
  onChange,
}: {
  value: StockLoc;
  onChange: (v: StockLoc) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as StockLoc)}>
      <SelectTrigger className="w-full">
        <SelectValue>{(v) => stockLocLabel(v as StockLoc)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STOCK_LOCS.map((l) => (
          <SelectItem key={l} value={l} label={stockLocLabel(l)}>
            {stockLocLabel(l)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TransferForm({ lots }: { lots: Lot[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lotId, setLotId] = useState(lots[0]?.id ?? "");
  const [bags, setBags] = useState("");
  const [from, setFrom] = useState<StockLoc>("MS");
  const [to, setTo] = useState<StockLoc>("NM");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");

  const selected = useMemo(() => lots.find((l) => l.id === lotId), [lots, lotId]);
  const available = selected ? stockAt(selected, from) : 0;

  // Picking the same place on both sides swaps them, so From and To never match.
  function pickFrom(v: StockLoc) {
    if (v === to) setTo(from);
    setFrom(v);
  }
  function pickTo(v: StockLoc) {
    if (v === from) setFrom(to);
    setTo(v);
  }

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
        `Only ${available} bags available at ${stockLocLabel(from)}. Continue anyway?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await addTransfer({
        lotId: selected.id,
        bags: Math.floor(n),
        from,
        to,
        date,
        note: note.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Moved ${n} bags of ${selected.name}: ${stockLocLabel(from)} → ${stockLocLabel(to)}`,
      );
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
                  return l ? l.name : "Pick a lot";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {lots.map((l) => (
                <SelectItem key={l.id} value={l.id} label={l.name}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="From" required>
          <PlaceSelect value={from} onChange={pickFrom} />
        </Field>
        <Field label="To" required>
          <PlaceSelect value={to} onChange={pickTo} />
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
              ? `Available at ${stockLocLabel(from)}: ${available}`
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
