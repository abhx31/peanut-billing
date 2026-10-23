"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PattiAdjustmentsFields } from "@/components/patti-adjustments-fields";
import { HamaliOnUsField } from "@/components/hamali-on-us-field";
import { money, num, pad2, parseBagWeights, r2 } from "@/lib/format";
import { getSalePattiForEdit, updateSalePatti } from "./sale-actions";

type Lot = { id: string; name: string; left: number };

type Row = {
  key: string;
  itemId?: string; // present = existing line; absent = new line added here
  lotId: string;
  bagsStr: string;
  kgStr: string;
  rateStr: string;
  weightsText: string;
};

type Props = {
  billId: string;
  billNo: number;
  lots: Lot[];
};

export function EditSalePattiDialog({ billId, billNo, lots }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState("");
  const [buyer, setBuyer] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [cdOn, setCdOn] = useState(false);
  const [cdPct, setCdPct] = useState("1");
  const [labOn, setLabOn] = useState(false);
  const [labRate, setLabRate] = useState("");
  const [brOn, setBrOn] = useState(false);
  const [brRate, setBrRate] = useState("10");
  const [brSign, setBrSign] = useState<1 | -1>(1);
  const [transportOn, setTransportOn] = useState(false);
  const [transport, setTransport] = useState("");
  const [hamaliOn, setHamaliOn] = useState(false);
  const [hamaliRate, setHamaliRate] = useState("");

  const [newLotId, setNewLotId] = useState(lots[0]?.id ?? "");
  const [newBags, setNewBags] = useState("");
  const [newKg, setNewKg] = useState("");
  const [newRate, setNewRate] = useState("");
  const [newWeights, setNewWeights] = useState("");

  async function load() {
    setLoading(true);
    const data = await getSalePattiForEdit(billId);
    setLoading(false);
    if (!data) {
      toast.error("Could not load this sale patti.");
      setOpen(false);
      return;
    }
    setDate(data.date);
    setBuyer(data.buyer);
    setRows(
      data.items.map((it) => ({
        key: it.itemId,
        itemId: it.itemId,
        lotId: it.lotId,
        bagsStr: String(it.bags),
        kgStr: String(it.kg),
        rateStr: String(it.rate),
        weightsText: it.weightsText,
      })),
    );
    setCdOn(data.cdPct > 0);
    setCdPct(data.cdPct > 0 ? String(data.cdPct) : "1");
    setLabOn(data.labRate > 0);
    setLabRate(data.labRate > 0 ? String(data.labRate) : "");
    setBrOn(data.brRate > 0);
    setBrRate(data.brRate > 0 ? String(data.brRate) : "10");
    setBrSign(data.brSign);
    setTransportOn(data.transport > 0);
    setTransport(data.transport > 0 ? String(data.transport) : "");
    setHamaliOn(data.hamaliPerBag > 0);
    setHamaliRate(data.hamaliPerBag > 0 ? String(data.hamaliPerBag) : "");
  }

  function onNewWeights(v: string) {
    setNewWeights(v);
    const p = parseBagWeights(v);
    if (p.count > 0) {
      setNewBags(String(p.count));
      setNewKg(String(p.totalKg));
    }
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  function removeRow(key: string) {
    setRows((xs) => xs.filter((x) => x.key !== key));
  }

  function addLine() {
    const bagsN = num(newBags);
    const kgN = num(newKg);
    const rateN = num(newRate);
    if (!newLotId || bagsN <= 0 || kgN <= 0 || rateN <= 0) {
      toast.error("Pick a lot and enter bags, weight and price before adding.");
      return;
    }
    setRows((xs) => [
      ...xs,
      {
        key: crypto.randomUUID(),
        lotId: newLotId,
        bagsStr: newBags,
        kgStr: newKg,
        rateStr: newRate,
        weightsText: newWeights.trim(),
      },
    ]);
    setNewBags("");
    setNewKg("");
    setNewRate("");
    setNewWeights("");
  }

  const bagsTotal = rows.reduce((s, r) => s + (num(r.bagsStr) || 0), 0);
  const amount = r2(
    rows.reduce((s, r) => s + (num(r.kgStr) || 0) * (num(r.rateStr) || 0), 0),
  );
  const cd = cdOn ? r2((amount * (num(cdPct) || 0)) / 100) : 0;
  const labor = labOn ? r2(bagsTotal * (num(labRate) || 0)) : 0;
  const broker = brOn ? r2(bagsTotal * (num(brRate) || 0)) : 0;
  const trans = transportOn ? num(transport) || 0 : 0;
  const net = Math.round(amount - cd - labor + brSign * broker - trans);
  const hamali = hamaliOn ? r2(bagsTotal * (num(hamaliRate) || 0)) : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedBuyer = buyer.trim();
    if (!trimmedBuyer) {
      toast.error("Buyer name cannot be empty.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Pick a valid date.");
      return;
    }
    if (rows.length === 0) {
      toast.error("A sale patti needs at least one lot.");
      return;
    }
    for (const r of rows) {
      if (!r.lotId || num(r.bagsStr) <= 0 || num(r.kgStr) <= 0 || num(r.rateStr) <= 0) {
        toast.error("Every line needs a lot, bags, weight and price.");
        return;
      }
    }

    startTransition(async () => {
      const res = await updateSalePatti({
        billId,
        date,
        buyer: trimmedBuyer,
        items: rows.map((r) => ({
          itemId: r.itemId,
          lotId: r.lotId,
          bags: num(r.bagsStr),
          kg: num(r.kgStr),
          rate: num(r.rateStr),
          weightsText: r.weightsText,
        })),
        cdPct: cdOn ? num(cdPct) : 0,
        labRate: labOn ? num(labRate) : 0,
        brRate: brOn ? num(brRate) : 0,
        brSign,
        transport: trans,
        hamaliPerBag: hamaliOn ? num(hamaliRate) || 0 : 0,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Sale patti updated");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) load();
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            <Pencil className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Edit</span>
          </Button>
        }
      />
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit sale patti P {pad2(billNo)}</DialogTitle>
          <DialogDescription>
            Change the date, buyer, adjustments, or any lot line. Add or remove
            lines too. Payments stay as recorded — use Receive or the receipt
            actions for those.
          </DialogDescription>
        </DialogHeader>

        {loading || !date ? (
          <p className="text-sm text-muted-foreground py-6">Loading…</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="esp-date">Date</Label>
                <Input
                  id="esp-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="esp-buyer">Buyer</Label>
                <Input
                  id="esp-buyer"
                  value={buyer}
                  onChange={(e) => setBuyer(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.key} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Lot</Label>
                      <Select
                        value={r.lotId}
                        onValueChange={(v) => updateRow(r.key, { lotId: v ?? r.lotId })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(v) => lots.find((l) => l.id === v)?.name ?? "Pick a lot"}
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
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`esp-bags-${r.key}`}>Bags</Label>
                      <Input
                        id={`esp-bags-${r.key}`}
                        type="number"
                        min="0"
                        step="1"
                        value={r.bagsStr}
                        onChange={(e) => updateRow(r.key, { bagsStr: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`esp-kg-${r.key}`}>Weight (kg)</Label>
                      <Input
                        id={`esp-kg-${r.key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.kgStr}
                        onChange={(e) => updateRow(r.key, { kgStr: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`esp-rate-${r.key}`}>Price per kg (₹)</Label>
                      <Input
                        id={`esp-rate-${r.key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.rateStr}
                        onChange={(e) => updateRow(r.key, { rateStr: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground tabular-nums">
                      Line amount:{" "}
                      {money(r2((num(r.kgStr) || 0) * (num(r.rateStr) || 0)))}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => removeRow(r.key)}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No lines left — add at least one below before saving.
                </p>
              )}
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-sm font-medium">+ Add another lot</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Lot</Label>
                  <Select value={newLotId} onValueChange={(v) => setNewLotId(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v) => {
                          const l = lots.find((x) => x.id === v);
                          return l ? `${l.name} (${l.left} left)` : "Pick a lot";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {lots.map((l) => (
                        <SelectItem key={l.id} value={l.id} label={`${l.name} (${l.left} left)`}>
                          {l.name} ({l.left} left)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="esp-new-bags">Bags</Label>
                  <Input
                    id="esp-new-bags"
                    type="number"
                    min="0"
                    step="1"
                    value={newBags}
                    onChange={(e) => setNewBags(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="esp-new-kg">Weight (kg)</Label>
                  <Input
                    id="esp-new-kg"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newKg}
                    onChange={(e) => setNewKg(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="esp-new-rate">Price per kg (₹)</Label>
                  <Input
                    id="esp-new-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="esp-new-weights">Each bag&apos;s weight (optional)</Label>
                  <Textarea
                    id="esp-new-weights"
                    rows={2}
                    value={newWeights}
                    onChange={(e) => onNewWeights(e.target.value)}
                    placeholder="40.5 41 50x40.5"
                  />
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                + Add line
              </Button>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-sm font-medium">Adjustments</div>
              <PattiAdjustmentsFields
                cdOn={cdOn}
                setCdOn={setCdOn}
                cdPct={cdPct}
                setCdPct={setCdPct}
                labOn={labOn}
                setLabOn={setLabOn}
                labRate={labRate}
                setLabRate={setLabRate}
                brOn={brOn}
                setBrOn={setBrOn}
                brRate={brRate}
                setBrRate={setBrRate}
                brSign={brSign}
                setBrSign={setBrSign}
                transportOn={transportOn}
                setTransportOn={setTransportOn}
                transport={transport}
                setTransport={setTransport}
              />
            </div>

            <HamaliOnUsField
              on={hamaliOn}
              onToggle={setHamaliOn}
              ratePerBag={hamaliRate}
              onRateChange={setHamaliRate}
            />

            <div className="rounded-md bg-muted/60 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="tabular-nums">{money(amount)}</span>
              </div>
              {hamaliOn && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hamali (on us, not billed)</span>
                  <span className="tabular-nums">{money(hamali)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span>New net receivable</span>
                <span className="tabular-nums">{money(net)}</span>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
