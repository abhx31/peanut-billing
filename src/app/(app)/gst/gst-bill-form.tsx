"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormActions } from "@/components/form";
import { fyOf, money, num, parseBagWeights, r2, today } from "@/lib/format";
import type { GstProfile } from "@/lib/gst-types";
import { saveGstBill } from "./actions";

type Lot = { id: string; name: string; left: number };
type GstCust = {
  id: string;
  name: string;
  state: string | null;
  stateCode: string | null;
  gstin: string | null;
  address: string | null;
};

type Props = {
  profile: GstProfile;
  customers: GstCust[];
  lots: Lot[];
};

type CartItem = {
  key: string;
  lotId: string;
  lotName: string;
  description: string;
  hsn: string;
  bags: number;
  kg: number;
  rate: number;
  amount: number;
  weights: string;
};

export function GstBillForm({ profile, customers, lots }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(today());
  const [buyerId, setBuyerId] = useState(customers[0]?.id ?? "");
  const [consigneeSame, setConsigneeSame] = useState(true);
  const [consigneeId, setConsigneeId] = useState(customers[0]?.id ?? "");
  const [gstPercent, setGstPercent] = useState("5");

  const [ewb, setEwb] = useState("");
  const [veh, setVeh] = useState("");
  const [through, setThrough] = useState("Self");
  const [destination, setDestination] = useState("");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [lotId, setLotId] = useState(lots[0]?.id ?? "");
  const [description, setDescription] = useState("Ground Nuts");
  const [hsn, setHsn] = useState("12023090");
  const [bags, setBags] = useState("");
  const [weights, setWeights] = useState("");
  const [kg, setKg] = useState("");
  const [rate, setRate] = useState("");
  const [amountOverride, setAmountOverride] = useState("");

  const [credit, setCredit] = useState(false);
  const [cash, setCash] = useState("");
  const [upi, setUpi] = useState("");
  const [cj, setCj] = useState("");

  const buyer = customers.find((c) => c.id === buyerId);
  const intra =
    (profile.stateCode ?? "").toString().trim() ===
    (buyer?.stateCode ?? "").toString().trim();

  function onWeightsChange(v: string) {
    setWeights(v);
    const p = parseBagWeights(v);
    if (p.count > 0) {
      setBags(String(p.count));
      setKg(String(p.totalKg));
    }
  }

  const currentLine = useMemo((): CartItem | null => {
    const bagsN = num(bags);
    const kgN = num(kg);
    const rateN = num(rate);
    const ovN = num(amountOverride);
    const lot = lots.find((l) => l.id === lotId);
    if (!lot || bagsN <= 0 || kgN <= 0 || (rateN <= 0 && ovN <= 0)) return null;
    const amount = ovN > 0 ? r2(ovN) : r2(kgN * rateN);
    return {
      key: "current",
      lotId: lot.id,
      lotName: lot.name,
      description: description.trim() || "Ground Nuts",
      hsn: hsn.trim() || "12023090",
      bags: bagsN,
      kg: kgN,
      rate: rateN,
      amount,
      weights: weights.trim(),
    };
  }, [bags, kg, rate, amountOverride, lotId, description, hsn, weights, lots]);

  const items = useMemo(
    () => (currentLine ? [...cart, currentLine] : cart),
    [cart, currentLine],
  );

  const calc = useMemo(() => {
    const taxable = r2(items.reduce((s, i) => s + i.amount, 0));
    const taxTotal = r2((taxable * num(gstPercent)) / 100);
    const cgst = intra ? r2(taxTotal / 2) : 0;
    const sgst = intra ? r2(taxTotal - cgst) : 0;
    const igst = intra ? 0 : taxTotal;
    const preRound = r2(taxable + cgst + sgst + igst);
    const total = Math.round(preRound);
    const roundOff = r2(total - preRound);
    const paid = credit ? 0 : num(cash) + num(upi) + num(cj);
    const balance = r2(total - paid);
    return { taxable, taxTotal, cgst, sgst, igst, preRound, total, roundOff, paid, balance };
  }, [items, gstPercent, intra, credit, cash, upi, cj]);

  function clearCurrentLine() {
    setBags("");
    setWeights("");
    setKg("");
    setRate("");
    setAmountOverride("");
  }

  function addToCart() {
    if (!currentLine) {
      toast.error("Pick a lot and enter bags, weight and price (or amount).");
      return;
    }
    setCart((xs) => [...xs, { ...currentLine, key: crypto.randomUUID() }]);
    clearCurrentLine();
  }

  function removeFromCart(key: string) {
    setCart((xs) => xs.filter((x) => x.key !== key));
  }

  function reset() {
    setCart([]);
    clearCurrentLine();
    setCash("");
    setUpi("");
    setCj("");
    setCredit(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!buyerId) {
      toast.error("Pick a buyer.");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one lot.");
      return;
    }
    startTransition(async () => {
      const res = await saveGstBill({
        date,
        buyerId,
        consigneeId: consigneeSame ? buyerId : consigneeId,
        gstPercent: num(gstPercent),
        items: items.map((it) => ({
          lotId: it.lotId,
          description: it.description,
          hsn: it.hsn,
          weightsText: it.weights,
          bags: it.bags,
          kg: it.kg,
          rate: it.rate,
          amountOverride: it.amount,
        })),
        header: {
          ewb: ewb.trim(),
          veh: veh.trim(),
          through: through.trim(),
          destination: destination.trim(),
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
        },
        payCash: credit ? 0 : num(cash),
        payUpi: credit ? 0 : num(upi),
        payCj: credit ? 0 : num(cj),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Saved GST invoice ${res.no} · ${res.fy}`);
      reset();
      router.push(`/bills/${res.billId}/print`);
    });
  }

  const fy = fyOf(date);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 flex-wrap">
            GST tax invoice
            <Badge variant="secondary">Period {fy}</Badge>
            <Badge variant={intra ? "secondary" : "outline"} className="text-xs">
              {intra ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="g-date">Date</Label>
            <Input
              id="g-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label>Buyer (bill to)</Label>
            <Select value={buyerId} onValueChange={(v) => setBuyerId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a GST customer">
                  {(v) => customers.find((c) => c.id === v)?.name ?? "Pick a buyer"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id} label={c.name}>
                    {c.name}
                    {c.stateCode ? ` · ${c.stateCode}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={consigneeSame}
                onChange={(e) => setConsigneeSame(e.target.checked)}
              />
              Consignee (ship to) is the same as buyer
            </label>
            {!consigneeSame && (
              <Select value={consigneeId} onValueChange={(v) => setConsigneeId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick consignee">
                    {(v) => customers.find((c) => c.id === v)?.name ?? "Pick consignee"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id} label={c.name}>
                      {c.name}
                      {c.stateCode ? ` · ${c.stateCode}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="g-ewb">e-Way bill no.</Label>
            <Input id="g-ewb" value={ewb} onChange={(e) => setEwb(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g-veh">Motor vehicle no.</Label>
            <Input id="g-veh" value={veh} onChange={(e) => setVeh(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g-through">Dispatched through</Label>
            <Input
              id="g-through"
              value={through}
              onChange={(e) => setThrough(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="g-dest">Destination</Label>
            <Input
              id="g-dest"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lots in this invoice</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fill the row below and tap <b>Add this lot to the invoice</b>. For a single
            lot you can just fill the row and tap Save — it&apos;s auto-included.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {cart.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Lot</th>
                    <th className="py-2 pr-4">Description</th>
                    <th className="py-2 pr-4">HSN</th>
                    <th className="py-2 pr-4 text-right">Bags</th>
                    <th className="py-2 pr-4 text-right">Kg</th>
                    <th className="py-2 pr-4 text-right">Rate</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {cart.map((it) => (
                    <tr key={it.key} className="border-b last:border-0">
                      <td className="py-2 pr-4">{it.lotName}</td>
                      <td className="py-2 pr-4">{it.description}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{it.hsn}</td>
                      <td className="py-2 pr-4 text-right">{it.bags}</td>
                      <td className="py-2 pr-4 text-right">{it.kg}</td>
                      <td className="py-2 pr-4 text-right">{money(it.rate)}</td>
                      <td className="py-2 pr-4 text-right font-semibold">
                        {money(it.amount)}
                      </td>
                      <td className="py-2 pr-0 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFromCart(it.key)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Lot / quality (stock)</Label>
                <Select value={lotId} onValueChange={(v) => setLotId(v ?? "")}>
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
                      <SelectItem
                        key={l.id}
                        value={l.id}
                        label={`${l.name} (${l.left} left)`}
                      >
                        {l.name} ({l.left} left)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-desc">Description on invoice</Label>
                <Input
                  id="g-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-hsn">HSN / SAC</Label>
                <Input
                  id="g-hsn"
                  value={hsn}
                  onChange={(e) => setHsn(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-bags">No. of bags</Label>
                <Input
                  id="g-bags"
                  type="number"
                  min="0"
                  step="1"
                  value={bags}
                  onChange={(e) => setBags(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-kg">Total weight (kg)</Label>
                <Input
                  id="g-kg"
                  type="number"
                  min="0"
                  step="0.01"
                  value={kg}
                  onChange={(e) => setKg(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-rate">Rate per kg (₹)</Label>
                <Input
                  id="g-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <Label htmlFor="g-weights">
                  Bag weights (optional) — same format as new bill
                </Label>
                <Textarea
                  id="g-weights"
                  rows={2}
                  value={weights}
                  onChange={(e) => onWeightsChange(e.target.value)}
                  placeholder="40.5 41 50x40.5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-amtov">Or item amount (₹)</Label>
                <Input
                  id="g-amtov"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountOverride}
                  onChange={(e) => setAmountOverride(e.target.value)}
                  placeholder="Overrides kg × rate"
                />
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addToCart}>
              <Plus className="h-4 w-4 mr-1" />
              Add this lot to the invoice
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax &amp; payment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
          <div className="space-y-2">
            <Label>GST rate</Label>
            <Select value={gstPercent} onValueChange={(v) => setGstPercent(v ?? "5")}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v) => `${v ?? "5"}%`}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0" label="0%">0%</SelectItem>
                <SelectItem value="5" label="5%">5% (CGST 2.5 + SGST 2.5)</SelectItem>
                <SelectItem value="12" label="12%">12%</SelectItem>
                <SelectItem value="18" label="18%">18%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="g-cash">Paid cash (₹)</Label>
            <Input
              id="g-cash"
              type="number"
              min="0"
              step="0.01"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              disabled={credit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g-upi">Paid UPI (₹)</Label>
            <Input
              id="g-upi"
              type="number"
              min="0"
              step="0.01"
              value={upi}
              onChange={(e) => setUpi(e.target.value)}
              disabled={credit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g-cj">Paid via CJ (₹)</Label>
            <Input
              id="g-cj"
              type="number"
              min="0"
              step="0.01"
              value={cj}
              onChange={(e) => setCj(e.target.value)}
              disabled={credit}
            />
          </div>
          <div className="space-y-2">
            <Label>Payment option</Label>
            <Button
              type="button"
              variant={credit ? "default" : "outline"}
              className="w-full"
              onClick={() => {
                setCredit((v) => !v);
                if (!credit) {
                  setCash("");
                  setUpi("");
                  setCj("");
                }
              }}
            >
              {credit ? "On credit (balance)" : "Balance / credit"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <SumCell label="Taxable" value={money(calc.taxable)} />
            {intra ? (
              <>
                <SumCell label={`CGST ${num(gstPercent) / 2}%`} value={money(calc.cgst)} />
                <SumCell label={`SGST ${num(gstPercent) / 2}%`} value={money(calc.sgst)} />
              </>
            ) : (
              <SumCell label={`IGST ${gstPercent}%`} value={money(calc.igst)} />
            )}
            <SumCell label="Round off" value={money(calc.roundOff)} />
            <SumCell label="Invoice total" value={money(calc.total)} strong />
            <SumCell
              label="Balance"
              value={money(calc.balance)}
              danger={calc.balance > 0.5}
            />
          </div>
        </CardContent>
      </Card>

      <FormActions>
        <Button type="submit" disabled={pending} size="lg">
          <Save className="mr-2 h-4 w-4" />
          {pending ? "Saving…" : "Save & view"}
        </Button>
      </FormActions>
    </form>
  );
}

function SumCell({
  label,
  value,
  strong,
  danger,
}: {
  label: string;
  value: string;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-lg tabular-nums ${strong ? "font-bold" : "font-semibold"} ${danger ? "text-destructive" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
