"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import { HamaliOnUsField } from "@/components/hamali-on-us-field";
import { money, num, parseBagWeights, r2, today } from "@/lib/format";
import type { GstProfile } from "@/lib/gst-types";
import { useFormDraft } from "@/lib/use-form-draft";
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
  nextInvoiceNo: number;
  currentFy: string;
  lotCosts: Record<string, string> | null;
  /** Store the draft is kept for ("MS" / "NM"). */
  loc: "MS" | "NM";
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

export function GstBillForm({
  profile,
  customers,
  lots,
  nextInvoiceNo,
  currentFy,
  lotCosts,
  loc,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(today());
  const [buyerId, setBuyerId] = useState("");
  const [consigneeSame, setConsigneeSame] = useState(true);
  const [consigneeId, setConsigneeId] = useState("");
  const [gstPercent, setGstPercent] = useState("5");

  const [ewb, setEwb] = useState("");
  const [veh, setVeh] = useState("");
  const [through, setThrough] = useState("Self");
  const [destination, setDestination] = useState("");

  // Collapsible "More invoice details"
  const [dn, setDn] = useState("");
  const [mp, setMp] = useState("");
  const [rf, setRf] = useState("");
  const [or, setOr] = useState("");
  const [bo, setBo] = useState("");
  const [bd, setBd] = useState("");
  const [dd, setDd] = useState("");
  const [dt, setDt] = useState("");
  const [lr, setLr] = useState("");
  const [td, setTd] = useState("");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [lotId, setLotId] = useState(lots[0]?.id ?? "");
  const [description, setDescription] = useState("Ground Nuts");
  const [hsn, setHsn] = useState("12023090");
  const [bags, setBags] = useState("");
  const [weights, setWeights] = useState("");
  const [kg, setKg] = useState("");
  const [rate, setRate] = useState("");
  const [amountOverride, setAmountOverride] = useState("");

  const [hamaliOn, setHamaliOn] = useState(true);
  const [hamaliRate, setHamaliRate] = useState("10");

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
    const bagsTotal = items.reduce((s, i) => s + i.bags, 0);
    const taxable = r2(items.reduce((s, i) => s + i.amount, 0));
    const taxTotal = r2((taxable * num(gstPercent)) / 100);
    const cgst = intra ? r2(taxTotal / 2) : 0;
    const sgst = intra ? r2(taxTotal - cgst) : 0;
    const igst = intra ? 0 : taxTotal;
    const preRound = r2(taxable + cgst + sgst + igst);
    const total = Math.round(preRound);
    const roundOff = r2(total - preRound);
    // On us — tracked for the Hamali tab only, never part of the invoice total.
    const hamali = hamaliOn ? r2(bagsTotal * num(hamaliRate)) : 0;
    const paid = credit ? 0 : num(cash) + num(upi) + num(cj);
    const balance = r2(total - paid);
    const profit = lotCosts
      ? r2(
          items.reduce((s, i) => {
            const cost = Number(lotCosts[i.lotId] ?? 0);
            return s + (i.amount - i.kg * cost);
          }, 0),
        )
      : null;
    return {
      bagsTotal,
      taxable,
      taxTotal,
      cgst,
      sgst,
      igst,
      preRound,
      total,
      roundOff,
      hamali,
      paid,
      balance,
      profit,
    };
  }, [items, gstPercent, intra, hamaliOn, hamaliRate, credit, cash, upi, cj, lotCosts]);

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
    setHamaliOn(true);
    setHamaliRate("10");
    setCash("");
    setUpi("");
    setCj("");
    setCredit(false);
  }

  // An unsaved GST invoice survives the tab being dropped (phone call, app
  // switch, reload) — kept on this device until it's saved. Buyer and
  // transport details stay filled after a save by design, so only lines and
  // payments decide whether there is a draft worth keeping.
  const draft = useFormDraft({
    key: `gst-bill:${loc}`,
    value: {
      date,
      buyerId,
      consigneeSame,
      consigneeId,
      gstPercent,
      ewb,
      veh,
      through,
      destination,
      dn,
      mp,
      rf,
      or,
      bo,
      bd,
      dd,
      dt,
      lr,
      td,
      cart,
      lotId,
      description,
      hsn,
      bags,
      weights,
      kg,
      rate,
      amountOverride,
      hamaliOn,
      hamaliRate,
      credit,
      cash,
      upi,
      cj,
    },
    isEmpty: (v) =>
      v.cart.length === 0 &&
      !v.bags &&
      !v.weights.trim() &&
      !v.kg &&
      !v.rate &&
      !v.cash &&
      !v.upi &&
      !v.cj,
    restore: (v) => {
      setDate(v.date);
      setConsigneeSame(v.consigneeSame);
      setGstPercent(v.gstPercent);
      setEwb(v.ewb);
      setVeh(v.veh);
      setThrough(v.through);
      setDestination(v.destination);
      setDn(v.dn);
      setMp(v.mp);
      setRf(v.rf);
      setOr(v.or);
      setBo(v.bo);
      setBd(v.bd);
      setDd(v.dd);
      setDt(v.dt);
      setLr(v.lr);
      setTd(v.td);
      setCart(v.cart);
      setDescription(v.description);
      setHsn(v.hsn);
      setBags(v.bags);
      setWeights(v.weights);
      setKg(v.kg);
      setRate(v.rate);
      setAmountOverride(v.amountOverride);
      setHamaliOn(v.hamaliOn);
      setHamaliRate(v.hamaliRate);
      setCredit(v.credit);
      setCash(v.cash);
      setUpi(v.upi);
      setCj(v.cj);
      if (customers.some((c) => c.id === v.buyerId)) setBuyerId(v.buyerId);
      if (customers.some((c) => c.id === v.consigneeId)) setConsigneeId(v.consigneeId);
      if (lots.some((l) => l.id === v.lotId)) setLotId(v.lotId);
    },
    discard: reset,
  });

  function submit(mode: "save" | "save-view" | "save-print") {
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
        hamaliPerBag: hamaliOn ? num(hamaliRate) : 0,
        header: {
          ewb: ewb.trim(),
          veh: veh.trim(),
          through: through.trim(),
          destination: destination.trim(),
          dn: dn.trim(),
          mp: mp.trim(),
          rf: rf.trim(),
          or: or.trim(),
          bo: bo.trim(),
          bd: bd.trim(),
          dd: dd.trim(),
          dt: dt.trim(),
          lr: lr.trim(),
          td: td.trim(),
        },
        payCash: credit ? 0 : num(cash),
        payUpi: credit ? 0 : num(upi),
        payCj: credit ? 0 : num(cj),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      draft.clear();
      toast.success(`Saved GST invoice ${res.no} · ${res.fy}`);
      if (mode === "save-view") {
        window.open(`/bills/${res.billId}/print`, "_blank");
      } else if (mode === "save-print") {
        window.open(`/bills/${res.billId}/print?size=A4`, "_blank");
      }
      reset();
      router.refresh();
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit("save");
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 flex-wrap">
            GST tax invoice
            <Badge variant={intra ? "secondary" : "outline"} className="text-xs">
              {intra ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"}
            </Badge>
          </CardTitle>
          <p className="text-sm font-semibold">
            Invoice no. {nextInvoiceNo} · period {currentFy}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="g-date">Date</Label>
              <Input
                id="g-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Buyer (bill to)</Label>
              <Select value={buyerId} onValueChange={(v) => setBuyerId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select customer">
                    {(v) =>
                      customers.find((c) => c.id === v)?.name ?? "Select customer"
                    }
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
            <div className="space-y-2">
              <Label htmlFor="g-dest">Destination</Label>
              <Input
                id="g-dest"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={consigneeSame}
              onChange={(e) => setConsigneeSame(e.target.checked)}
            />
            Consignee (ship to) is the same as buyer
          </label>
          {!consigneeSame && (
            <div className="space-y-2">
              <Label>Consignee (ship to)</Label>
              <Select
                value={consigneeId}
                onValueChange={(v) => setConsigneeId(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick consignee">
                    {(v) =>
                      customers.find((c) => c.id === v)?.name ?? "Pick consignee"
                    }
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
          )}

          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold select-none">
              More invoice details (optional)
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <HeaderField id="g-dn" label="Delivery note" value={dn} setValue={setDn} />
              <HeaderField
                id="g-mp"
                label="Mode / terms of payment"
                value={mp}
                setValue={setMp}
              />
              <HeaderField
                id="g-rf"
                label="Reference no. & date"
                value={rf}
                setValue={setRf}
              />
              <HeaderField
                id="g-or"
                label="Other references"
                value={or}
                setValue={setOr}
              />
              <HeaderField id="g-bo" label="Buyer's order no." value={bo} setValue={setBo} />
              <HeaderField
                id="g-bd"
                label="Buyer's order date"
                value={bd}
                setValue={setBd}
              />
              <HeaderField id="g-dd" label="Dispatch doc no." value={dd} setValue={setDd} />
              <HeaderField
                id="g-dt"
                label="Delivery note date"
                value={dt}
                setValue={setDt}
              />
              <HeaderField
                id="g-lr"
                label="Bill of lading / LR-RR no."
                value={lr}
                setValue={setLr}
              />
              <HeaderField
                id="g-td"
                label="Terms of delivery"
                value={td}
                setValue={setTd}
              />
            </div>
          </details>

          <div>
            <h2 className="text-base font-semibold mb-2">Lots in this invoice</h2>
            {cart.length > 0 ? (
              <div className="overflow-x-auto mb-3">
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
            ) : (
              <p className="text-sm text-muted-foreground mb-3">
                No lot added yet. Fill in a lot below and tap the add button, or just
                save if the invoice has one lot.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Lot / quality (stock)</Label>
                <Select value={lotId} onValueChange={(v) => setLotId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => {
                        const l = lots.find((x) => x.id === v);
                        return l ? `${l.name} (${l.left} bags left)` : "Pick a lot";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {lots.map((l) => (
                      <SelectItem
                        key={l.id}
                        value={l.id}
                        label={`${l.name} (${l.left} bags left)`}
                      >
                        {l.name} ({l.left} bags left)
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
                <Label htmlFor="g-hsn">HSN/SAC</Label>
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
                  inputMode="numeric"
                  value={bags}
                  onChange={(e) => setBags(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="g-weights">
                  Weight of each bag (kg) – separate with space, comma or new line.
                  Same weight bags: 50x40.5
                </Label>
                <Textarea
                  id="g-weights"
                  rows={3}
                  value={weights}
                  onChange={(e) => onWeightsChange(e.target.value)}
                  placeholder="40.5 41 39.8 50x40.5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-kg">Total weight (kg)</Label>
                <Input
                  id="g-kg"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
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
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                  placeholder="overrides kg × rate"
                />
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={addToCart}
            >
              + Add this lot to the invoice
            </Button>
          </div>

          <HamaliOnUsField
            on={hamaliOn}
            onToggle={setHamaliOn}
            ratePerBag={hamaliRate}
            onRateChange={setHamaliRate}
          />

          <div className="grid gap-4 sm:grid-cols-2 items-end">
            <div className="space-y-2">
              <Label>GST rate</Label>
              <Select value={gstPercent} onValueChange={(v) => setGstPercent(v ?? "5")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => `${v ?? "5"}%`}</SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} className="w-72 min-w-72">
                  <SelectItem value="5" label="5% (CGST 2.5% + SGST 2.5%)">
                    5% (CGST 2.5% + SGST 2.5%)
                  </SelectItem>
                  <SelectItem value="0" label="0%">0%</SelectItem>
                  <SelectItem value="12" label="12% (CGST 6% + SGST 6%)">
                    12% (CGST 6% + SGST 6%)
                  </SelectItem>
                  <SelectItem value="18" label="18% (CGST 9% + SGST 9%)">
                    18% (CGST 9% + SGST 9%)
                  </SelectItem>
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
                inputMode="decimal"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                disabled={credit}
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-upi">Paid UPI (₹)</Label>
              <Input
                id="g-upi"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={upi}
                onChange={(e) => setUpi(e.target.value)}
                disabled={credit}
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-cj">Paid via CJ (₹)</Label>
              <Input
                id="g-cj"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={cj}
                onChange={(e) => setCj(e.target.value)}
                disabled={credit}
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SumCell label="Taxable value" value={money(calc.taxable)} />
            {intra ? (
              <>
                <SumCell
                  label={`CGST ${num(gstPercent) / 2}%`}
                  value={money(calc.cgst)}
                />
                <SumCell
                  label={`SGST ${num(gstPercent) / 2}%`}
                  value={money(calc.sgst)}
                />
              </>
            ) : (
              <SumCell label={`IGST ${gstPercent}%`} value={money(calc.igst)} />
            )}
            <SumCell label="Round off" value={money(calc.roundOff)} />
            {hamaliOn && (
              <SumCell label="Hamali (on us, not billed)" value={money(calc.hamali)} />
            )}
            <SumCell label="Total" value={money(calc.total)} strong />
            <SumCell
              label="Balance"
              value={money(calc.balance)}
              danger={calc.balance > 0.5}
            />
            {calc.profit !== null && (
              <SumCell label="Profit on this invoice" value={money(calc.profit)} />
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending} size="lg">
              {pending ? "Saving…" : "Save invoice"}
            </Button>
            <Button
              type="button"
              disabled={pending}
              size="lg"
              onClick={() => submit("save-view")}
            >
              Save &amp; view
            </Button>
            <Button
              type="button"
              disabled={pending}
              size="lg"
              onClick={() => submit("save-print")}
            >
              Save &amp; print
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function HeaderField({
  id,
  label,
  value,
  setValue,
}: {
  id: string;
  label: string;
  value: string;
  setValue: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => setValue(e.target.value)} />
    </div>
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
