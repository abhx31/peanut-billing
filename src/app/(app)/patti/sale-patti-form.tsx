"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Receipt } from "lucide-react";
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
import { money, num, pad2, parseBagWeights, r2, today } from "@/lib/format";
import { saveSalePatti } from "./sale-actions";

type Lot = { id: string; name: string; left: number };

type Props = {
  lots: Lot[];
  customers: string[];
};

export function SalePattiForm({ lots, customers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(today());
  const [buyer, setBuyer] = useState("");
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

  const calc = useMemo(() => {
    const bagsN = num(bags);
    const kgN = num(kg);
    const rateN = num(rate);
    const amount = r2(kgN * rateN);
    const cd = cdOn ? r2((amount * num(cdPct)) / 100) : 0;
    const labor = labOn ? r2(bagsN * num(labRate)) : 0;
    const broker = brOn ? r2(bagsN * num(brRate)) : 0;
    const trans = transportOn ? num(transport) : 0;
    const net = r2(amount - cd - labor + brSign * broker - trans);
    const paid = credit ? 0 : num(cash) + num(upi) + num(cj);
    const balance = r2(net - paid);
    return { bagsN, kgN, rateN, amount, cd, labor, broker, trans, net, paid, balance };
  }, [bags, kg, rate, cdOn, cdPct, labOn, labRate, brOn, brRate, brSign, transportOn, transport, credit, cash, upi, cj]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!buyer.trim() || calc.bagsN <= 0 || calc.kgN <= 0 || calc.rateN <= 0) {
      toast.error("Enter buyer, bags, weight and price.");
      return;
    }
    const lot = lots.find((l) => l.id === lotId);
    if (lot && calc.bagsN > lot.left) {
      if (
        !confirm(
          `Only ${lot.left} bags of "${lot.name}" at the current store. Save anyway?`,
        )
      ) {
        return;
      }
    }
    startTransition(async () => {
      const res = await saveSalePatti({
        date,
        buyer: buyer.trim(),
        lotId,
        weightsText: weights.trim(),
        bags: calc.bagsN,
        kg: calc.kgN,
        rate: calc.rateN,
        cdPct: cdOn ? num(cdPct) : 0,
        labRate: labOn ? num(labRate) : 0,
        brRate: brOn ? num(brRate) : 0,
        brSign,
        transport: transportOn ? num(transport) : 0,
        payCash: credit ? 0 : num(cash),
        payUpi: credit ? 0 : num(upi),
        payCj: credit ? 0 : num(cj),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Saved sale patti P ${pad2(res.no)} · net ${money(calc.net)}`);
      setBuyer("");
      setBags("");
      setWeights("");
      setKg("");
      setRate("");
      setCdOn(false);
      setLabOn(false);
      setBrOn(false);
      setBrSign(1);
      setTransportOn(false);
      setTransport("");
      setCash("");
      setUpi("");
      setCj("");
      setCredit(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <FormSection
        icon={Receipt}
        title="Buyer & lot"
        description="Sell from stock using patti-style adjustments. The bags come off the lot you pick."
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
      </FormSection>

      <FormSection title="Adjustments" description="Tick only what applies.">
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
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <SumCell label="Amount" value={money(calc.amount)} />
          {cdOn && <SumCell label={`CD ${cdPct}% (−)`} value={money(calc.cd)} />}
          {labOn && <SumCell label="Labour (−)" value={money(calc.labor)} />}
          {brOn && (
            <SumCell label={`Brokerage (${brSign === 1 ? "+" : "−"})`} value={money(calc.broker)} />
          )}
          {transportOn && <SumCell label="Transport (−)" value={money(calc.trans)} />}
          <SumCell label="Net receivable" value={money(calc.net)} strong />
          <SumCell label="Balance" value={money(calc.balance)} danger={calc.balance > 0.5} />
        </div>
      </FormSection>

      <FormActions>
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
