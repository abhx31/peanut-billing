"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Receipt, Trash2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormSection, FormGrid, Field, FormActions } from "@/components/form";
import { HamaliOnUsField } from "@/components/hamali-on-us-field";
import { money, num, pad2, parseBagWeights, r2, today } from "@/lib/format";
import { useFormDraft } from "@/lib/use-form-draft";
import { saveSalePatti } from "./sale-actions";

type Lot = { id: string; name: string; left: number };

type Props = {
  lots: Lot[];
  customers: string[];
  /** Store the draft is kept for ("MS" / "NM"). */
  loc: "MS" | "NM";
};

type CartItem = {
  key: string;
  lotId: string;
  lotName: string;
  weightsText: string;
  bags: number;
  kg: number;
  rate: number;
  amount: number;
};

export function SalePattiForm({ lots, customers, loc }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(today());
  const [buyer, setBuyer] = useState("");

  // Current line + cart.
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lotId, setLotId] = useState(lots[0]?.id ?? "");
  const [bags, setBags] = useState("");
  const [weights, setWeights] = useState("");
  const [kg, setKg] = useState("");
  const [rate, setRate] = useState("");

  const [cdOn, setCdOn] = useState(false);
  const [cdPct, setCdPct] = useState("1");
  const [labOn, setLabOn] = useState(false);
  const [labRate, setLabRate] = useState("");
  const [brOn, setBrOn] = useState(false);
  const [brRate, setBrRate] = useState("10");
  const [brSign, setBrSign] = useState<1 | -1>(1);
  const [transportOn, setTransportOn] = useState(false);
  const [transport, setTransport] = useState("");
  const [hamaliOn, setHamaliOn] = useState(true);
  const [hamaliRate, setHamaliRate] = useState("10");
  const [credit, setCredit] = useState(false);
  const [cash, setCash] = useState("");
  const [upi, setUpi] = useState("");
  const [cj, setCj] = useState("");

  function onWeights(v: string) {
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
    if (!lotId || bagsN <= 0 || kgN <= 0 || rateN <= 0) return null;
    const lot = lots.find((l) => l.id === lotId);
    return {
      key: "current",
      lotId,
      lotName: lot?.name ?? "",
      weightsText: weights.trim(),
      bags: bagsN,
      kg: kgN,
      rate: rateN,
      amount: r2(kgN * rateN),
    };
  }, [bags, kg, rate, weights, lotId, lots]);

  // Effective items for preview / save = cart + current line.
  const items = useMemo(
    () => (currentLine ? [...cart, currentLine] : cart),
    [cart, currentLine],
  );

  const calc = useMemo(() => {
    const bagsTotal = items.reduce((s, i) => s + i.bags, 0);
    const kgTotal = r2(items.reduce((s, i) => s + i.kg, 0));
    const amount = r2(items.reduce((s, i) => s + i.amount, 0));
    const cd = cdOn ? r2((amount * num(cdPct)) / 100) : 0;
    const labor = labOn ? r2(bagsTotal * num(labRate)) : 0;
    const broker = brOn ? r2(bagsTotal * num(brRate)) : 0;
    const trans = transportOn ? num(transport) : 0;
    const net = r2(amount - cd - labor + brSign * broker - trans);
    // On us — tracked for the Hamali tab only, never part of net/balance.
    const hamali = hamaliOn ? r2(bagsTotal * num(hamaliRate)) : 0;
    const paid = credit ? 0 : num(cash) + num(upi) + num(cj);
    const balance = r2(net - paid);
    return { bagsTotal, kgTotal, amount, cd, labor, broker, trans, hamali, net, paid, balance };
  }, [
    items,
    cdOn,
    cdPct,
    labOn,
    labRate,
    brOn,
    brRate,
    brSign,
    transportOn,
    transport,
    hamaliOn,
    hamaliRate,
    credit,
    cash,
    upi,
    cj,
  ]);

  function clearCurrentLine() {
    setBags("");
    setWeights("");
    setKg("");
    setRate("");
    // Keep the lotId so the common "same lot twice" case is slightly faster;
    // user can still switch it on the next line.
  }

  function resetForm() {
    setBuyer("");
    setCart([]);
    clearCurrentLine();
    setCdOn(false);
    setLabOn(false);
    setBrOn(false);
    setBrSign(1);
    setTransportOn(false);
    setTransport("");
    setHamaliOn(true);
    setHamaliRate("10");
    setCash("");
    setUpi("");
    setCj("");
    setCredit(false);
  }

  // An unsaved sale patti survives the tab being dropped (phone call, app
  // switch, reload) — kept on this device until it's saved.
  const draft = useFormDraft({
    key: `sale-patti:${loc}`,
    value: {
      date,
      buyer,
      cart,
      lotId,
      bags,
      weights,
      kg,
      rate,
      cdOn,
      cdPct,
      labOn,
      labRate,
      brOn,
      brRate,
      brSign,
      transportOn,
      transport,
      hamaliOn,
      hamaliRate,
      credit,
      cash,
      upi,
      cj,
    },
    isEmpty: (v) =>
      !v.buyer.trim() &&
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
      setBuyer(v.buyer);
      setCart(v.cart);
      if (lots.some((l) => l.id === v.lotId)) setLotId(v.lotId);
      setBags(v.bags);
      setWeights(v.weights);
      setKg(v.kg);
      setRate(v.rate);
      setCdOn(v.cdOn);
      setCdPct(v.cdPct);
      setLabOn(v.labOn);
      setLabRate(v.labRate);
      setBrOn(v.brOn);
      setBrRate(v.brRate);
      setBrSign(v.brSign);
      setTransportOn(v.transportOn);
      setTransport(v.transport);
      setHamaliOn(v.hamaliOn);
      setHamaliRate(v.hamaliRate);
      setCredit(v.credit);
      setCash(v.cash);
      setUpi(v.upi);
      setCj(v.cj);
    },
    discard: resetForm,
  });

  function addToCart() {
    if (!currentLine) {
      toast.error("Pick a lot and fill in bags, weight and price before adding this lot.");
      return;
    }
    setCart((xs) => [...xs, { ...currentLine, key: crypto.randomUUID() }]);
    clearCurrentLine();
  }

  function removeFromCart(key: string) {
    setCart((xs) => xs.filter((x) => x.key !== key));
  }

  // Catch any lot where the total bags across every cart line (plus the
  // current line) would exceed what's in stock at the Working-at store.
  const stockWarnings = useMemo(() => {
    const perLot = new Map<string, number>();
    for (const it of items) {
      perLot.set(it.lotId, (perLot.get(it.lotId) ?? 0) + it.bags);
    }
    const warnings: { lotName: string; wanted: number; left: number }[] = [];
    for (const [id, wanted] of perLot) {
      const lot = lots.find((l) => l.id === id);
      if (!lot) continue;
      if (wanted > lot.left) {
        warnings.push({ lotName: lot.name, wanted, left: lot.left });
      }
    }
    return warnings;
  }, [items, lots]);

  function submit(mode: "save" | "save-print") {
    if (!buyer.trim() || items.length === 0) {
      toast.error("Enter buyer and at least one lot with bags, weight and price.");
      return;
    }
    if (stockWarnings.length > 0) {
      const msg = stockWarnings
        .map((w) => `  • ${w.lotName}: ${w.wanted} wanted, only ${w.left} in stock`)
        .join("\n");
      if (!confirm(`Some lots don't have enough stock:\n${msg}\n\nSave anyway?`)) {
        return;
      }
    }
    startTransition(async () => {
      const res = await saveSalePatti({
        date,
        buyer: buyer.trim(),
        items: items.map((it) => ({
          lotId: it.lotId,
          weightsText: it.weightsText,
          bags: it.bags,
          kg: it.kg,
          rate: it.rate,
        })),
        cdPct: cdOn ? num(cdPct) : 0,
        labRate: labOn ? num(labRate) : 0,
        brRate: brOn ? num(brRate) : 0,
        brSign,
        transport: transportOn ? num(transport) : 0,
        hamaliPerBag: hamaliOn ? num(hamaliRate) : 0,
        payCash: credit ? 0 : num(cash),
        payUpi: credit ? 0 : num(upi),
        payCj: credit ? 0 : num(cj),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      draft.clear();
      toast.success(`Saved sale patti P ${pad2(res.no)} · net ${money(calc.net)}`);
      if (mode === "save-print") {
        window.open(`/bills/${res.billId}/print`, "_blank");
      }
      resetForm();
      router.refresh();
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit("save");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FormSection
        icon={Receipt}
        title="Buyer & lots"
        description="Sell from stock using patti-style adjustments. Add one or more lots for this buyer; the current line is included automatically on save."
      >
        <FormGrid>
          <Field label="Date" htmlFor="sp-date" required>
            <Input
              id="sp-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Buyer / customer" htmlFor="sp-buyer" required>
            <Input
              id="sp-buyer"
              list="sp-cust-list"
              value={buyer}
              onChange={(e) => setBuyer(e.target.value)}
              autoComplete="off"
            />
            <datalist id="sp-cust-list">
              {customers.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </FormGrid>

        {cart.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4">Lot</th>
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
                    <td className="py-2 pr-4">{it.lotName || "—"}</td>
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
                        aria-label="Remove lot"
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

        <FormGrid>
          <Field label="Lot (stock)" required>
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
                  <SelectItem key={l.id} value={l.id} label={`${l.name} (${l.left} bags left)`}>
                    {l.name} ({l.left} bags left)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Bags" htmlFor="sp-bags" required>
            <Input id="sp-bags" type="number" min="0" step="1" value={bags} onChange={(e) => setBags(e.target.value)} />
          </Field>
          <Field label="Total weight (kg)" htmlFor="sp-kg" required>
            <Input id="sp-kg" type="number" min="0" step="0.01" value={kg} onChange={(e) => setKg(e.target.value)} />
          </Field>
          <Field label="Price per kg (₹)" htmlFor="sp-rate" required>
            <Input id="sp-rate" type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          <Field label="Each bag's weight (kg) – optional" htmlFor="sp-w" span={3}>
            <Textarea id="sp-w" rows={2} value={weights} onChange={(e) => onWeights(e.target.value)} />
          </Field>
        </FormGrid>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={addToCart}
          disabled={!currentLine}
        >
          + Add this lot to the sale patti (another lot for the same buyer)
        </Button>
      </FormSection>

      <FormSection title="Adjustments" description="Tick only what applies. CD, labour and transport apply to the whole bill; broker can be added or deducted.">
        <FormGrid>
          <Field label="CD % (−)">
            <label className="flex items-center gap-2 text-sm pt-1">
              <input type="checkbox" checked={cdOn} onChange={(e) => setCdOn(e.target.checked)} />
              <Input type="number" min="0" step="0.1" value={cdPct} onChange={(e) => setCdPct(e.target.value)} disabled={!cdOn} />
            </label>
          </Field>
          <Field label="Labour ₹ per bag (−)">
            <label className="flex items-center gap-2 text-sm pt-1">
              <input type="checkbox" checked={labOn} onChange={(e) => setLabOn(e.target.checked)} />
              <Input type="number" min="0" step="0.5" value={labRate} onChange={(e) => setLabRate(e.target.value)} disabled={!labOn} />
            </label>
          </Field>
          <Field label={`Brokerage ₹ per bag (${brSign === 1 ? "+" : "−"})`}>
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" checked={brOn} onChange={(e) => setBrOn(e.target.checked)} />
              <Input type="number" min="0" step="0.5" value={brRate} onChange={(e) => setBrRate(e.target.value)} disabled={!brOn} />
              <Button type="button" size="sm" variant="outline" onClick={() => setBrSign((s) => (s === 1 ? -1 : 1))} disabled={!brOn}>
                {brSign === 1 ? "+ Add" : "− Deduct"}
              </Button>
            </div>
          </Field>
          <Field label="Transportation ₹ (−)">
            <label className="flex items-center gap-2 text-sm pt-1">
              <input type="checkbox" checked={transportOn} onChange={(e) => setTransportOn(e.target.checked)} />
              <Input type="number" min="0" step="0.01" value={transport} onChange={(e) => setTransport(e.target.value)} disabled={!transportOn} />
            </label>
          </Field>
        </FormGrid>
        <div className="mt-3">
          <HamaliOnUsField
            on={hamaliOn}
            onToggle={setHamaliOn}
            ratePerBag={hamaliRate}
            onRateChange={setHamaliRate}
          />
        </div>
      </FormSection>

      <FormSection title="Payment" description="How the buyer paid for the sale net (or leave on credit)." compact>
        <FormGrid cols={4}>
          <Field label="Paid cash (₹)" htmlFor="sp-cash">
            <Input id="sp-cash" type="number" min="0" step="0.01" value={cash} onChange={(e) => setCash(e.target.value)} disabled={credit} />
          </Field>
          <Field label="Paid UPI (₹)" htmlFor="sp-upi">
            <Input id="sp-upi" type="number" min="0" step="0.01" value={upi} onChange={(e) => setUpi(e.target.value)} disabled={credit} />
          </Field>
          <Field label="Paid via CJ (₹)" htmlFor="sp-cj">
            <Input id="sp-cj" type="number" min="0" step="0.01" value={cj} onChange={(e) => setCj(e.target.value)} disabled={credit} />
          </Field>
          <Field label="Payment option">
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
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Preview" compact>
        <div className="grid gap-3 sm:grid-cols-2">
          <SumCell label="Bags · kg" value={`${calc.bagsTotal} · ${calc.kgTotal}`} />
          <SumCell label="Amount" value={money(calc.amount)} />
          {cdOn && <SumCell label={`CD ${cdPct}% (−)`} value={money(calc.cd)} />}
          {labOn && <SumCell label="Labour (−)" value={money(calc.labor)} />}
          {brOn && (
            <SumCell label={`Brokerage (${brSign === 1 ? "+" : "−"})`} value={money(calc.broker)} />
          )}
          {transportOn && <SumCell label="Transport (−)" value={money(calc.trans)} />}
          {hamaliOn && (
            <SumCell label="Hamali (on us, not billed)" value={money(calc.hamali)} />
          )}
          <SumCell label="Net receivable" value={money(calc.net)} strong />
          <SumCell label="Balance" value={money(calc.balance)} danger={calc.balance > 0.5} />
        </div>
      </FormSection>

      <FormActions>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          size="lg"
          onClick={() => submit("save-print")}
        >
          <Printer className="mr-2 h-4 w-4" />
          Save &amp; print
        </Button>
        <Button type="submit" disabled={pending} size="lg">
          <Save className="mr-2 h-4 w-4" />
          {pending ? "Saving…" : "Save sale patti"}
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
      <div className={`text-lg tabular-nums ${strong ? "font-bold" : "font-semibold"} ${danger ? "text-destructive" : ""}`}>
        {value}
      </div>
    </div>
  );
}
