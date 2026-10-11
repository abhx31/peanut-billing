"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Printer, Save, Trash2 } from "lucide-react";
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
import { FormActions } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { fyOf, money, num, pad2, parseBagWeights, r2, today } from "@/lib/format";
import { saveBill } from "./actions";

type Lot = { id: string; name: string; left: number };

type Props = {
  lots: Lot[];
  hamaliDefault: number;
  customers: { name: string; balance: number }[];
  lotCosts: Record<string, string> | null;
  loc: "" | "NM";
};

type CartItem = {
  key: string;
  lotId: string;
  lotName: string;
  bags: number;
  kg: number;
  rate: number;
  amount: number;
  weights: string;
};

export function BillForm({ lots, hamaliDefault, customers, lotCosts, loc }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const storeLabel = loc === "NM" ? "New Mahavir" : "Main store";

  const [date, setDate] = useState(today());
  const [customer, setCustomer] = useState("");
  const [hamaliPerBag, setHamaliPerBag] = useState(String(hamaliDefault));
  const [gstPercent, setGstPercent] = useState("0");

  // Cart (lines already added) + the current input line.
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lotId, setLotId] = useState(lots[0]?.id ?? "");
  const [bags, setBags] = useState("");
  const [weights, setWeights] = useState("");
  const [kg, setKg] = useState("");
  const [rate, setRate] = useState("");

  const [credit, setCredit] = useState(false);
  const [cash, setCash] = useState("");
  const [upi, setUpi] = useState("");
  const [cj, setCj] = useState("");

  const parsedWeights = useMemo(() => parseBagWeights(weights), [weights]);

  function onWeightsChange(v: string) {
    setWeights(v);
    const p = parseBagWeights(v);
    if (p.count > 0) {
      setBags(String(p.count));
      setKg(String(p.totalKg));
    }
  }

  // Build the "current line" if the input area is valid (same as inspiration's curItem()).
  const currentLine = useMemo((): CartItem | null => {
    const bagsN = num(bags);
    const kgN = num(kg);
    const rateN = num(rate);
    const lot = lots.find((l) => l.id === lotId);
    if (!lot || bagsN <= 0 || kgN <= 0 || rateN <= 0) return null;
    return {
      key: "current",
      lotId: lot.id,
      lotName: lot.name,
      bags: bagsN,
      kg: kgN,
      rate: rateN,
      amount: r2(kgN * rateN),
      weights: weights.trim(),
    };
  }, [bags, kg, rate, lotId, lots, weights]);

  // Effective items for preview / save = cart + current line.
  const items = useMemo(
    () => (currentLine ? [...cart, currentLine] : cart),
    [cart, currentLine],
  );

  const calc = useMemo(() => {
    const totalBags = items.reduce((s, i) => s + i.bags, 0);
    const totalKg = items.reduce((s, i) => s + i.kg, 0);
    const amount = r2(items.reduce((s, i) => s + i.amount, 0));
    const hamali = r2(totalBags * num(hamaliPerBag));
    const gst = r2((amount * num(gstPercent)) / 100);
    const total = r2(amount + hamali + gst);
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
    return { totalBags, totalKg, amount, hamali, gst, total, paid, balance, profit };
  }, [items, hamaliPerBag, gstPercent, cash, upi, cj, credit, lotCosts]);

  const fy = fyOf(date);

  // Previous balance hint: when the typed customer name matches an existing customer with pending balance.
  const previousBalance = useMemo(() => {
    const q = customer.trim().toLowerCase();
    if (!q) return 0;
    const found = customers.find((c) => c.name.toLowerCase() === q);
    return found && found.balance > 0.5 ? found.balance : 0;
  }, [customer, customers]);

  function clearCurrentLine() {
    setBags("");
    setWeights("");
    setKg("");
    setRate("");
  }

  function addToCart() {
    if (!currentLine) {
      toast.error("Pick a lot and enter bags, weight and price first.");
      return;
    }
    setCart((xs) => [
      ...xs,
      { ...currentLine, key: crypto.randomUUID() },
    ]);
    clearCurrentLine();
  }

  function removeFromCart(key: string) {
    setCart((xs) => xs.filter((x) => x.key !== key));
  }

  function reset() {
    setCustomer("");
    setCart([]);
    clearCurrentLine();
    setGstPercent("0");
    setCash("");
    setUpi("");
    setCj("");
    setCredit(false);
  }

  function validateAndWarn(): boolean {
    if (!customer.trim()) {
      toast.error("Enter a customer name.");
      return false;
    }
    if (items.length === 0) {
      toast.error("Add at least one lot (pick lot + bags + weight + price).");
      return false;
    }
    const neededByLot = new Map<string, { name: string; need: number }>();
    for (const it of items) {
      const prev = neededByLot.get(it.lotId);
      neededByLot.set(it.lotId, {
        name: it.lotName,
        need: (prev?.need ?? 0) + it.bags,
      });
    }
    for (const [lotId, { name, need }] of neededByLot) {
      const lot = lots.find((l) => l.id === lotId);
      if (lot && need > lot.left) {
        if (
          !confirm(
            `Only ${lot.left} bags of "${name}" in stock at ${storeLabel}. Save anyway?`,
          )
        ) {
          return false;
        }
      }
    }
    return true;
  }

  function submit(mode: "save" | "save-print") {
    if (!validateAndWarn()) return;
    startTransition(async () => {
      const res = await saveBill({
        date,
        customer: customer.trim(),
        items: items.map((it) => ({
          lotId: it.lotId,
          weightsText: it.weights,
          bags: it.bags,
          kg: it.kg,
          rate: it.rate,
        })),
        hamaliPerBag: num(hamaliPerBag),
        gstPercent: num(gstPercent),
        payCash: credit ? 0 : num(cash),
        payUpi: credit ? 0 : num(upi),
        payCj: credit ? 0 : num(cj),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Saved bill ${pad2(res.billNo)} · ${fy}`);
      if (mode === "save-print") {
        window.open(`/bills/${res.billId}/print`, "_blank");
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
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 flex-wrap">
            Create bill
            <Badge variant="secondary">Period {fy}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2 sm:col-span-2 lg:col-span-2">
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
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
            {previousBalance > 0 && (
              <p className="text-xs text-warning">
                Earlier balance of this customer: <b>{money(previousBalance)}</b> (not
                included in this bill&apos;s total)
              </p>
            )}
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
                  {(v) => (v === "0" || v == null ? "Without GST" : `GST ${v}%`)}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lots in this bill</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fill the row below and tap <b>Add this lot</b> to put it in the bill. If you
            only have one lot, just fill the row and tap <b>Save bill</b> — the current row
            is included automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {cart.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Lot / quality</th>
                    <th className="py-2 pr-4 text-right">Bags</th>
                    <th className="py-2 pr-4 text-right">Kg</th>
                    <th className="py-2 pr-4 text-right">Price / kg</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {cart.map((it) => (
                    <tr key={it.key} className="border-b last:border-0">
                      <td className="py-2 pr-4">{it.lotName}</td>
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
                          aria-label="Remove line"
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
            <p className="text-sm text-muted-foreground">
              No lot added yet. Fill in a lot below, then tap <b>Add this lot</b>, or just
              save if the bill has one lot.
            </p>
          )}

          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline">Current line</Badge>
              {currentLine && (
                <span className="text-sm font-semibold tabular-nums">
                  {money(currentLine.amount)}
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2 lg:col-span-2">
                <Label>Lot / quality</Label>
                <Select value={lotId} onValueChange={(v) => setLotId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick a lot">
                      {(v) => {
                        const found = lots.find((l) => l.id === v);
                        return found
                          ? `${found.name} (${found.left} bags left)`
                          : "Pick a lot";
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
                <Label htmlFor="line-bags">Bags</Label>
                <Input
                  id="line-bags"
                  type="number"
                  min="0"
                  step="1"
                  value={bags}
                  onChange={(e) => setBags(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="line-kg">Total kg</Label>
                <Input
                  id="line-kg"
                  type="number"
                  min="0"
                  step="0.01"
                  value={kg}
                  onChange={(e) => setKg(e.target.value)}
                />
              </div>

              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <Label htmlFor="line-weights">
                  Bag weights (kg) — &quot;50x40.5&quot; = 50 bags of 40.5 kg
                </Label>
                <Textarea
                  id="line-weights"
                  rows={2}
                  value={weights}
                  onChange={(e) => onWeightsChange(e.target.value)}
                  placeholder="40.5 41 39.8 50x40.5"
                />
                {parsedWeights.count > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {parsedWeights.count} bags · {parsedWeights.totalKg} kg total
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="line-rate">Price per kg (₹)</Label>
                <Input
                  id="line-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addToCart}
                disabled={!currentLine}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add this lot to the bill
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
          <p className="text-sm text-muted-foreground">
            Billing at <b>{storeLabel}</b> — cash and UPI go to this store&apos;s ledger.
            Use <b>CJ</b> when the customer pays through the go-between (settles later).
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <Label htmlFor="cj">Paid via CJ (₹)</Label>
            <Input
              id="cj"
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
            <SumCell
              label="Bags · kg"
              value={`${calc.totalBags} · ${r2(calc.totalKg)}`}
            />
            <SumCell label="Amount" value={money(calc.amount)} />
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
            {calc.profit !== null && (
              <SumCell label="Profit on this bill" value={money(calc.profit)} />
            )}
          </div>
        </CardContent>
      </Card>

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
          {pending ? "Saving…" : "Save bill"}
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
