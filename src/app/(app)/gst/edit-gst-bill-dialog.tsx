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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HamaliOnUsField } from "@/components/hamali-on-us-field";
import { money, num, pad2, r2 } from "@/lib/format";
import { getGstBillForEdit, updateGstBill } from "./actions";

type Lot = { id: string; name: string };

type Row = {
  key: string;
  itemId?: string;
  lotId: string;
  description: string;
  hsn: string;
  bagsStr: string;
  kgStr: string;
  rateStr: string;
};

const HEADER_FIELDS: { key: keyof HeaderState; label: string }[] = [
  { key: "ewb", label: "e-Way Bill No." },
  { key: "veh", label: "Vehicle No." },
  { key: "through", label: "Dispatched through" },
  { key: "destination", label: "Destination" },
  { key: "dn", label: "Delivery Note" },
  { key: "mp", label: "Mode/Terms of Payment" },
  { key: "rf", label: "Reference No. & Date" },
  { key: "or", label: "Other References" },
  { key: "bo", label: "Buyer's Order No." },
  { key: "bd", label: "Buyer's Order Date" },
  { key: "dd", label: "Dispatch Doc No." },
  { key: "dt", label: "Delivery Note Date" },
  { key: "lr", label: "Bill of Lading / LR-RR No." },
  { key: "td", label: "Terms of Delivery" },
];

type HeaderState = {
  ewb: string;
  veh: string;
  through: string;
  destination: string;
  dn: string;
  mp: string;
  rf: string;
  or: string;
  bo: string;
  bd: string;
  dd: string;
  dt: string;
  lr: string;
  td: string;
};

const emptyHeader: HeaderState = {
  ewb: "",
  veh: "",
  through: "",
  destination: "",
  dn: "",
  mp: "",
  rf: "",
  or: "",
  bo: "",
  bd: "",
  dd: "",
  dt: "",
  lr: "",
  td: "",
};

type Props = {
  billId: string;
  billNo: number;
  lots: Lot[];
};

export function EditGstBillDialog({ billId, billNo, lots }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [gstPercent, setGstPercent] = useState("5");
  const [rows, setRows] = useState<Row[]>([]);
  const [header, setHeader] = useState<HeaderState>(emptyHeader);
  const [hamaliOn, setHamaliOn] = useState(false);
  const [hamaliRate, setHamaliRate] = useState("");

  const [newLotId, setNewLotId] = useState(lots[0]?.id ?? "");
  const [newDescription, setNewDescription] = useState("Ground Nuts");
  const [newHsn, setNewHsn] = useState("12023090");
  const [newBags, setNewBags] = useState("");
  const [newKg, setNewKg] = useState("");
  const [newRate, setNewRate] = useState("");

  async function load() {
    setLoading(true);
    const data = await getGstBillForEdit(billId);
    setLoading(false);
    if (!data) {
      toast.error("Could not load this invoice.");
      setOpen(false);
      return;
    }
    setDate(data.date);
    setBuyerName(data.buyerName);
    setGstPercent(String(data.gstPercent));
    setRows(
      data.items.map((it) => ({
        key: it.itemId,
        itemId: it.itemId,
        lotId: it.lotId,
        description: it.description,
        hsn: it.hsn,
        bagsStr: String(it.bags),
        kgStr: String(it.kg),
        rateStr: String(it.rate),
      })),
    );
    setHeader(data.header);
    setHamaliOn(data.hamaliPerBag > 0);
    setHamaliRate(data.hamaliPerBag > 0 ? String(data.hamaliPerBag) : "");
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
    if (!newLotId || bagsN <= 0 || kgN <= 0 || rateN < 0) {
      toast.error("Pick a lot and enter bags and weight before adding.");
      return;
    }
    setRows((xs) => [
      ...xs,
      {
        key: crypto.randomUUID(),
        lotId: newLotId,
        description: newDescription.trim() || "Ground Nuts",
        hsn: newHsn.trim() || "12023090",
        bagsStr: newBags,
        kgStr: newKg,
        rateStr: newRate,
      },
    ]);
    setNewBags("");
    setNewKg("");
    setNewRate("");
  }

  const bagsTotal = rows.reduce((s, r) => s + (num(r.bagsStr) || 0), 0);
  const taxable = r2(
    rows.reduce((s, r) => s + (num(r.kgStr) || 0) * (num(r.rateStr) || 0), 0),
  );
  const taxTotal = r2((taxable * (num(gstPercent) || 0)) / 100);
  const total = Math.round(taxable + taxTotal);
  const hamali = hamaliOn ? r2(bagsTotal * (num(hamaliRate) || 0)) : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Pick a valid date.");
      return;
    }
    if (rows.length === 0) {
      toast.error("An invoice needs at least one line.");
      return;
    }
    for (const r of rows) {
      if (!r.lotId || num(r.bagsStr) <= 0 || num(r.kgStr) <= 0 || num(r.rateStr) < 0) {
        toast.error("Every line needs a lot, bags and weight.");
        return;
      }
    }

    startTransition(async () => {
      const res = await updateGstBill({
        billId,
        date,
        gstPercent: num(gstPercent),
        items: rows.map((r) => ({
          itemId: r.itemId,
          lotId: r.lotId,
          description: r.description,
          hsn: r.hsn,
          bags: num(r.bagsStr),
          kg: num(r.kgStr),
          rate: num(r.rateStr),
        })),
        hamaliPerBag: hamaliOn ? num(hamaliRate) || 0 : 0,
        header,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("GST invoice updated");
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
          <Button type="button" size="icon-sm" variant="outline" title="Edit">
            <Pencil className="h-3.5 w-3.5" />
            <span className="sr-only">Edit</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit GST invoice {pad2(billNo)}</DialogTitle>
          <DialogDescription>
            Change the date, GST %, logistics details, or any item line. The
            buyer ({buyerName || "…"}) can&apos;t be changed here — delete and
            recreate the invoice if it was billed to the wrong party.
            Payments stay as recorded.
          </DialogDescription>
        </DialogHeader>

        {loading || !date ? (
          <p className="text-sm text-muted-foreground py-6">Loading…</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="egb-date">Date</Label>
                <Input
                  id="egb-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="egb-pct">GST %</Label>
                <Input
                  id="egb-pct"
                  type="number"
                  min="0"
                  step="0.5"
                  value={gstPercent}
                  onChange={(e) => setGstPercent(e.target.value)}
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
                      <Label htmlFor={`egb-bags-${r.key}`}>Bags</Label>
                      <Input
                        id={`egb-bags-${r.key}`}
                        type="number"
                        min="0"
                        step="1"
                        value={r.bagsStr}
                        onChange={(e) => updateRow(r.key, { bagsStr: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`egb-kg-${r.key}`}>Weight (kg)</Label>
                      <Input
                        id={`egb-kg-${r.key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.kgStr}
                        onChange={(e) => updateRow(r.key, { kgStr: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`egb-rate-${r.key}`}>Price per kg (₹)</Label>
                      <Input
                        id={`egb-rate-${r.key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.rateStr}
                        onChange={(e) => updateRow(r.key, { rateStr: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`egb-desc-${r.key}`}>Description</Label>
                      <Input
                        id={`egb-desc-${r.key}`}
                        value={r.description}
                        onChange={(e) => updateRow(r.key, { description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`egb-hsn-${r.key}`}>HSN</Label>
                      <Input
                        id={`egb-hsn-${r.key}`}
                        value={r.hsn}
                        onChange={(e) => updateRow(r.key, { hsn: e.target.value })}
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
                  <Label htmlFor="egb-new-bags">Bags</Label>
                  <Input
                    id="egb-new-bags"
                    type="number"
                    min="0"
                    step="1"
                    value={newBags}
                    onChange={(e) => setNewBags(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="egb-new-kg">Weight (kg)</Label>
                  <Input
                    id="egb-new-kg"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newKg}
                    onChange={(e) => setNewKg(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="egb-new-rate">Price per kg (₹)</Label>
                  <Input
                    id="egb-new-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="egb-new-desc">Description</Label>
                  <Input
                    id="egb-new-desc"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="egb-new-hsn">HSN</Label>
                  <Input
                    id="egb-new-hsn"
                    value={newHsn}
                    onChange={(e) => setNewHsn(e.target.value)}
                  />
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                + Add line
              </Button>
            </div>

            <details className="rounded-lg border p-3">
              <summary className="text-sm font-medium cursor-pointer">
                Logistics / invoice header details (optional)
              </summary>
              <div className="grid gap-3 sm:grid-cols-2 mt-3">
                {HEADER_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label htmlFor={`egb-h-${f.key}`}>{f.label}</Label>
                    <Input
                      id={`egb-h-${f.key}`}
                      value={header[f.key]}
                      onChange={(e) =>
                        setHeader((h) => ({ ...h, [f.key]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            </details>

            <HamaliOnUsField
              on={hamaliOn}
              onToggle={setHamaliOn}
              ratePerBag={hamaliRate}
              onRateChange={setHamaliRate}
            />

            <div className="rounded-md bg-muted/60 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable value</span>
                <span className="tabular-nums">{money(taxable)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({gstPercent}%)</span>
                <span className="tabular-nums">{money(taxTotal)}</span>
              </div>
              {hamaliOn && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hamali (on us, not billed)</span>
                  <span className="tabular-nums">{money(hamali)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span>New total</span>
                <span className="tabular-nums">{money(total)}</span>
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
