"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { fyOf, money, num, pad2, parseBagWeights, r2, today } from "@/lib/format";
import { saveBill } from "./actions";

type Lot = { id: string; name: string; left: number };

type Props = {
  lots: Lot[];
  hamaliDefault: number;
  customers: string[];
  lotCosts: Record<string, string> | null;
};

export function BillForm({ lots, hamaliDefault, customers, lotCosts }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(today());
  const [customer, setCustomer] = useState("");
  const [lotId, setLotId] = useState(lots[0]?.id ?? "");
  const [bags, setBags] = useState("");
  const [weights, setWeights] = useState("");
  const [kg, setKg] = useState("");
  const [rate, setRate] = useState("");
  const [hamaliPerBag, setHamaliPerBag] = useState(String(hamaliDefault));
  const [gstPercent, setGstPercent] = useState("0");
  const [credit, setCredit] = useState(false);
  const [cash, setCash] = useState("");
  const [upi, setUpi] = useState("");

  const lot = useMemo(() => lots.find((l) => l.id === lotId), [lots, lotId]);
  const parsed = useMemo(() => parseBagWeights(weights), [weights]);

  function onWeightsChange(v: string) {
    setWeights(v);
    const p = parseBagWeights(v);
    if (p.count > 0) {
      setKg(String(p.totalKg));
      setBags(String(p.count));
    }
  }

  const calc = useMemo(() => {
    const bagsN = num(bags);
    const kgN = num(kg);
    const rateN = num(rate);
    const hamaliN = num(hamaliPerBag);
    const gstN = num(gstPercent);
    const cashN = num(cash);
    const upiN = num(upi);
    const amount = kgN * rateN;
    const hamali = bagsN * hamaliN;
    const gst = (amount * gstN) / 100;
    const total = amount + hamali + gst;
    const paid = credit ? 0 : cashN + upiN;
    const balance = total - paid;
    const cost = lotCosts && lot ? Number(lotCosts[lot.id] ?? 0) : 0;
    const profit = amount - kgN * cost;
    return { amount, hamali, gst, total, paid, balance, profit, bagsN, kgN, rateN };
  }, [bags, kg, rate, hamaliPerBag, gstPercent, cash, upi, credit, lot, lotCosts]);

  const fy = fyOf(date);

  function reset() {
    setCustomer("");
    setBags("");
    setWeights("");
    setKg("");
    setRate("");
    setGstPercent("0");
    setCash("");
    setUpi("");
    setCredit(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer.trim()) {
      toast.error("Enter a customer name.");
      return;
    }
    if (!lot) {
      toast.error("Pick a lot.");
      return;
    }
    if (calc.bagsN <= 0 || calc.kgN <= 0 || calc.rateN <= 0) {
      toast.error("Enter bags, weight and price.");
      return;
    }
    if (calc.bagsN > lot.left) {
      if (!confirm(`Only ${lot.left} bags in stock. Save anyway?`)) return;
    }

    startTransition(async () => {
      const res = await saveBill({
        date,
        customer: customer.trim(),
        lotId: lot.id,
        weightsText: weights.trim(),
        bags: calc.bagsN,
        kg: calc.kgN,
        rate: calc.rateN,
        hamaliPerBag: num(hamaliPerBag),
        gstPercent: num(gstPercent),
        payCash: credit ? 0 : num(cash),
        payUpi: credit ? 0 : num(upi),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Saved bill ${pad2(res.billNo)} · ${fy}`);
      reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            Create bill
            <span className="ml-3 text-sm font-normal text-muted-foreground">
              Period {fy}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="customer">Customer name</Label>
            <Input
              id="customer"
              list="customer-list"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Customer"
              autoComplete="off"
            />
            <datalist id="customer-list">
              {customers.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label>Lot / quality</Label>
            <Select value={lotId} onValueChange={(v) => setLotId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a lot">
                  {(v) => {
                    const found = lots.find((l) => l.id === v);
                    return found ? `${found.name} (${found.left} bags left)` : "Pick a lot";
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

          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="weights">
              Bag weights (kg) — space/comma separated. &quot;50x40.5&quot; means 50 bags of 40.5 kg.
            </Label>
            <Textarea
              id="weights"
              rows={3}
              value={weights}
              onChange={(e) => onWeightsChange(e.target.value)}
              placeholder="40.5 41 39.8 50x40.5"
            />
            {parsed.count > 0 && (
              <p className="text-sm text-muted-foreground">
                {parsed.count} bags · total {parsed.totalKg} kg
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bags">No. of bags</Label>
            <Input
              id="bags"
              type="number"
              min="0"
              step="1"
              value={bags}
              onChange={(e) => setBags(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="kg">Total weight (kg)</Label>
            <Input
              id="kg"
              type="number"
              min="0"
              step="0.01"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rate">Price per kg (₹)</Label>
            <Input
              id="rate"
              type="number"
              min="0"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hamali">Hamali per bag (₹)</Label>
            <Input
              id="hamali"
              type="number"
              min="0"
              step="0.5"
              value={hamaliPerBag}
              onChange={(e) => setHamaliPerBag(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Bill type</Label>
            <Select value={gstPercent} onValueChange={(v) => setGstPercent(v ?? "0")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick GST rate">
                  {(v) =>
                    v === "0" || v == null ? "Without GST" : `GST ${v}%`
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0" label="Without GST">Without GST</SelectItem>
                <SelectItem value="5" label="GST 5%">GST 5%</SelectItem>
                <SelectItem value="12" label="GST 12%">GST 12%</SelectItem>
                <SelectItem value="18" label="GST 18%">GST 18%</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cash">Paid cash (₹)</Label>
            <Input
              id="cash"
              type="number"
              min="0"
              step="0.01"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              disabled={credit}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="upi">Paid UPI (₹)</Label>
            <Input
              id="upi"
              type="number"
              min="0"
              step="0.01"
              value={upi}
              onChange={(e) => setUpi(e.target.value)}
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
          <div className="grid gap-3 sm:grid-cols-3">
            <SumCell label="Amount (kg × price)" value={money(calc.amount)} />
            <SumCell label="Hamali" value={money(calc.hamali)} />
            {num(gstPercent) > 0 && (
              <SumCell label={`GST ${gstPercent}%`} value={money(calc.gst)} />
            )}
            <SumCell label="Total" value={money(calc.total)} strong />
            <SumCell
              label="Balance"
              value={money(calc.balance)}
              danger={calc.balance > 0.5}
            />
            {lotCosts && (
              <SumCell label="Profit on this bill" value={money(r2(calc.profit))} />
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save bill"}
        </Button>
      </div>
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
        className={`text-lg ${strong ? "font-semibold" : "font-medium"} ${danger ? "text-destructive" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
