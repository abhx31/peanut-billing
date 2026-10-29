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
import { stateNameFromCode, INDIA_STATES } from "@/lib/india-states";
import { money, num, pad2, r2 } from "@/lib/format";
import { getGstPurchaseForEdit, updateGstPurchase } from "./actions";

type Lot = { id: string; name: string };

type Row = {
  key: string;
  lotName: string;
  description: string;
  hsn: string;
  bagsStr: string;
  kgStr: string;
  rateStr: string;
};

type Props = {
  id: string;
  no: number;
  lots: Lot[];
  firmStateCode: string;
};

export function EditGstPurchaseDialog({ id, no, lots, firmStateCode }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState("");
  const [party, setParty] = useState("");
  const [gstin, setGstin] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [address, setAddress] = useState("");
  const [invNo, setInvNo] = useState("");
  const [invDate, setInvDate] = useState("");
  const [pct, setPct] = useState("5");
  const [itcOn, setItcOn] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  const [newLotName, setNewLotName] = useState("");
  const [newDescription, setNewDescription] = useState("Ground Nuts");
  const [newHsn, setNewHsn] = useState("12023090");
  const [newBags, setNewBags] = useState("");
  const [newKg, setNewKg] = useState("");
  const [newRate, setNewRate] = useState("");

  function onGstinChange(v: string) {
    const upper = v.toUpperCase();
    setGstin(upper);
    const m = upper.match(/^(\d{2})/);
    if (m) setStateCode(m[1]);
  }

  async function load() {
    setLoading(true);
    const data = await getGstPurchaseForEdit(id);
    setLoading(false);
    if (!data) {
      toast.error("Could not load this GST purchase.");
      setOpen(false);
      return;
    }
    setDate(data.date);
    setParty(data.party);
    setGstin(data.supplier.gstin);
    setStateCode(data.supplier.code);
    setAddress(data.supplier.address);
    setInvNo(data.invNo);
    setInvDate(data.invDate);
    setPct(String(data.pct));
    setItcOn(data.itcOn);
    setRows(
      data.items.map((it) => ({
        key: crypto.randomUUID(),
        lotName: it.lotName,
        description: it.description,
        hsn: it.hsn,
        bagsStr: String(it.bags),
        kgStr: String(it.kg),
        rateStr: String(it.rate),
      })),
    );
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
    if (!newLotName.trim() || bagsN <= 0 || kgN <= 0 || rateN < 0) {
      toast.error("Enter the lot, bags, weight and price before adding.");
      return;
    }
    setRows((xs) => [
      ...xs,
      {
        key: crypto.randomUUID(),
        lotName: newLotName.trim(),
        description: newDescription.trim() || "Ground Nuts",
        hsn: newHsn.trim() || "12023090",
        bagsStr: newBags,
        kgStr: newKg,
        rateStr: newRate,
      },
    ]);
    setNewLotName("");
    setNewBags("");
    setNewKg("");
    setNewRate("");
  }

  const taxable = r2(
    rows.reduce((s, r) => s + (num(r.kgStr) || 0) * (num(r.rateStr) || 0), 0),
  );
  const intra = (firmStateCode ?? "").trim() === (stateCode ?? "").trim();
  const totalTax = r2((taxable * (num(pct) || 0)) / 100);
  const net = Math.round(taxable + totalTax);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedParty = party.trim();
    if (!trimmedParty) {
      toast.error("Supplier name cannot be empty.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Pick a valid date.");
      return;
    }
    if (rows.length === 0) {
      toast.error("A GST purchase needs at least one line.");
      return;
    }
    for (const r of rows) {
      if (!r.lotName.trim() || num(r.bagsStr) <= 0 || num(r.kgStr) <= 0 || num(r.rateStr) < 0) {
        toast.error("Every line needs a lot, bags and weight.");
        return;
      }
    }

    startTransition(async () => {
      const res = await updateGstPurchase({
        id,
        date,
        party: trimmedParty,
        supplier: {
          name: trimmedParty,
          gstin: gstin.trim(),
          state: stateNameFromCode(stateCode),
          code: stateCode.trim(),
          address: address.trim(),
        },
        invNo: invNo.trim(),
        invDate: invDate || undefined,
        items: rows.map((r) => ({
          lotName: r.lotName.trim(),
          description: r.description,
          hsn: r.hsn,
          bags: num(r.bagsStr),
          kg: num(r.kgStr),
          rate: num(r.rateStr),
        })),
        pct: num(pct),
        firmCode: firmStateCode,
        itcOn,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("GST purchase updated");
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
          <DialogTitle>Edit GST purchase GP {pad2(no)}</DialogTitle>
          <DialogDescription>
            Change the date, supplier, invoice details, GST %, ITC claim, or
            any item line. Whether this purchase added stock stays as
            recorded — stock entries update to match your edits. Payments
            stay as recorded — use the Payments recorded tab for those.
          </DialogDescription>
        </DialogHeader>

        {loading || !date ? (
          <p className="text-sm text-muted-foreground py-6">Loading…</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="egp-date">Date</Label>
                <Input
                  id="egp-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="egp-party">Supplier name</Label>
                <Input
                  id="egp-party"
                  value={party}
                  onChange={(e) => setParty(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="egp-gstin">Supplier GSTIN</Label>
                <Input
                  id="egp-gstin"
                  value={gstin}
                  onChange={(e) => onGstinChange(e.target.value)}
                  maxLength={15}
                />
              </div>
              <div className="space-y-1">
                <Label>Supplier state</Label>
                <Select value={stateCode} onValueChange={(v) => setStateCode(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => stateNameFromCode(v as string) || "Pick a state"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {INDIA_STATES.map((s) => (
                      <SelectItem key={s.code} value={s.code} label={s.name}>
                        {s.name} ({s.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="egp-address">Supplier address</Label>
                <Input
                  id="egp-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="egp-invno">Supplier invoice no.</Label>
                <Input
                  id="egp-invno"
                  value={invNo}
                  onChange={(e) => setInvNo(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="egp-invdate">Supplier invoice date</Label>
                <Input
                  id="egp-invdate"
                  type="date"
                  value={invDate}
                  onChange={(e) => setInvDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="egp-pct">GST %</Label>
                <Input
                  id="egp-pct"
                  type="number"
                  min="0"
                  step="0.5"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm pt-6">
                <input type="checkbox" checked={itcOn} onChange={(e) => setItcOn(e.target.checked)} />
                Claim ITC on this purchase
              </label>
            </div>

            <datalist id="egp-lot-list">
              {lots.map((l) => (
                <option key={l.id} value={l.name} />
              ))}
            </datalist>
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.key} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`egp-lot-${r.key}`}>Lot</Label>
                      <Input
                        id={`egp-lot-${r.key}`}
                        list="egp-lot-list"
                        value={r.lotName}
                        onChange={(e) => updateRow(r.key, { lotName: e.target.value })}
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`egp-bags-${r.key}`}>Bags</Label>
                      <Input
                        id={`egp-bags-${r.key}`}
                        type="number"
                        min="0"
                        step="1"
                        value={r.bagsStr}
                        onChange={(e) => updateRow(r.key, { bagsStr: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`egp-kg-${r.key}`}>Weight (kg)</Label>
                      <Input
                        id={`egp-kg-${r.key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.kgStr}
                        onChange={(e) => updateRow(r.key, { kgStr: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`egp-rate-${r.key}`}>Price per kg (₹)</Label>
                      <Input
                        id={`egp-rate-${r.key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.rateStr}
                        onChange={(e) => updateRow(r.key, { rateStr: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`egp-desc-${r.key}`}>Description</Label>
                      <Input
                        id={`egp-desc-${r.key}`}
                        value={r.description}
                        onChange={(e) => updateRow(r.key, { description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`egp-hsn-${r.key}`}>HSN</Label>
                      <Input
                        id={`egp-hsn-${r.key}`}
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
                  <Label htmlFor="egp-new-lot">Lot</Label>
                  <Input
                    id="egp-new-lot"
                    list="egp-lot-list"
                    value={newLotName}
                    onChange={(e) => setNewLotName(e.target.value)}
                    placeholder="Type a lot"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="egp-new-bags">Bags</Label>
                  <Input
                    id="egp-new-bags"
                    type="number"
                    min="0"
                    step="1"
                    value={newBags}
                    onChange={(e) => setNewBags(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="egp-new-kg">Weight (kg)</Label>
                  <Input
                    id="egp-new-kg"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newKg}
                    onChange={(e) => setNewKg(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="egp-new-rate">Price per kg (₹)</Label>
                  <Input
                    id="egp-new-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="egp-new-desc">Description</Label>
                  <Input
                    id="egp-new-desc"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="egp-new-hsn">HSN</Label>
                  <Input
                    id="egp-new-hsn"
                    value={newHsn}
                    onChange={(e) => setNewHsn(e.target.value)}
                  />
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                + Add line
              </Button>
            </div>

            <div className="rounded-md bg-muted/60 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable value</span>
                <span className="tabular-nums">{money(taxable)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {intra ? "CGST + SGST" : "IGST"} ({pct}%)
                </span>
                <span className="tabular-nums">{money(totalTax)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>New total payable</span>
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
