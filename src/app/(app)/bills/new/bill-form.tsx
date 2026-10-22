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
import { fyOf, money, num, pad2, parseBagWeights, r2, today } from "@/lib/format";
import { saveBill } from "./actions";

type Lot = { id: string; name: string; left: number };

type Props = {
  lots: Lot[];
  hamaliDefault: number;
  customers: { name: string; balance: number }[];
  lotCosts: Record<string, string> | null;
  loc: "MS" | "NM";
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
  const [customerPhone, setCustomerPhone] = useState("");
  const [hamaliPerBag, setHamaliPerBag] = useState(String(hamaliDefault));

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

  const items = useMemo(
    () => (currentLine ? [...cart, currentLine] : cart),
    [cart, currentLine],
  );

  const calc = useMemo(() => {
    const totalBags = items.reduce((s, i) => s + i.bags, 0);
    const totalKg = items.reduce((s, i) => s + i.kg, 0);
    const amount = r2(items.reduce((s, i) => s + i.amount, 0));
    const hamali = r2(totalBags * num(hamaliPerBag));
    const total = r2(amount + hamali);
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
    return { totalBags, totalKg, amount, hamali, total, paid, balance, profit };
  }, [items, hamaliPerBag, cash, upi, cj, credit, lotCosts]);

  const fy = fyOf(date);

  const nameKey = (s: string) =>
    s.trim().toLowerCase().replace(/\s+/g, " ");

  const previousBalance = useMemo(() => {
    const q = nameKey(customer);
    if (!q) return 0;
    const found = customers.find((c) => nameKey(c.name) === q);
    return found && found.balance > 0.5 ? found.balance : 0;
  }, [customer, customers]);

  const similarCustomers = useMemo(() => {
    const q = nameKey(customer);
    if (!q) return [];
    const exact = customers.find((c) => nameKey(c.name) === q);
    if (exact) return [];
    return customers
      .filter((c) => {
        if (c.balance <= 0.5) return false;
        const k = nameKey(c.name);
        return k.includes(q) || q.includes(k);
      })
      .slice(0, 4);
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
    setCart((xs) => [...xs, { ...currentLine, key: crypto.randomUUID() }]);
    clearCurrentLine();
  }

  function removeFromCart(key: string) {
    setCart((xs) => xs.filter((x) => x.key !== key));
  }

  function reset() {
    setCustomer("");
    setCustomerPhone("");
    setCart([]);
    clearCurrentLine();
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

  function submit(mode: "save" | "save-view" | "save-print") {
    if (!validateAndWarn()) return;
    startTransition(async () => {
      const res = await saveBill({
        date,
        customer: customer.trim(),
        customerPhone: customerPhone.trim(),
        items: items.map((it) => ({
          lotId: it.lotId,
          weightsText: it.weights,
          bags: it.bags,
          kg: it.kg,
          rate: it.rate,
        })),
        hamaliPerBag: num(hamaliPerBag),
        gstPercent: 0,
        payCash: credit ? 0 : num(cash),
        payUpi: credit ? 0 : num(upi),
        payCj: credit ? 0 : num(cj),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Saved bill ${pad2(res.billNo)} · ${fy}`);
      if (mode === "save-view") {
        window.open(`/bills/${res.billId}/print`, "_blank");
      } else if (mode === "save-print") {
        window.open(`/bills/${res.billId}/print?size=A5`, "_blank");
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
            Create bill
            <Badge variant="secondary">Period {fy}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-phone">Contact number (optional)</Label>
              <Input
                id="customer-phone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Phone"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hamali">Hamali per bag (₹)</Label>
              <Input
                id="hamali"
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                value={hamaliPerBag}
                onChange={(e) => setHamaliPerBag(e.target.value)}
              />
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold mb-2">Lots in this bill</h2>
            {cart.length > 0 && (
              <div className="overflow-x-auto mb-3">
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
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
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
                <Label htmlFor="line-rate">Price per kg (₹)</Label>
                <Input
                  id="line-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="line-weights">Weight of each bag (kg)</Label>
                <Textarea
                  id="line-weights"
                  rows={3}
                  value={weights}
                  onChange={(e) => onWeightsChange(e.target.value)}
                  placeholder="e.g. 40.5 41 39.8"
                />
                {parsedWeights.count > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {parsedWeights.count} bags · {parsedWeights.totalKg} kg total
                  </p>
                )}
              </div>
              <div className="space-y-2 sm:order-2">
                <Label htmlFor="line-bags">No. of bags</Label>
                <Input
                  id="line-bags"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={bags}
                  onChange={(e) => setBags(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:order-1">
                <Label htmlFor="line-kg">Total weight (kg)</Label>
                <Input
                  id="line-kg"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={kg}
                  onChange={(e) => setKg(e.target.value)}
                />
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={addToCart}
              disabled={!currentLine}
            >
              + Add this lot to the bill (another lot for the same customer)
            </Button>
          </div>

          <div>
            <h2 className="text-base font-semibold mb-2">Payment</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            </div>
          </div>

          {previousBalance > 0 && (
            <p className="text-xs text-warning">
              Earlier balance of this customer: <b>{money(previousBalance)}</b>{" "}
              (old dues + unpaid bills). It is added to the <b>Total due after
              this bill</b> below. Pay more than this bill and the extra will
              clear the earlier balance (old dues first, then older bills).
            </p>
          )}
          {previousBalance === 0 && similarCustomers.length > 0 && (
            <p className="text-xs text-muted-foreground">
              No customer with this exact name. Similar names with pending dues:{" "}
              {similarCustomers
                .map((c) => `${c.name} (${money(c.balance)})`)
                .join(", ")}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <SumCell
              label="Bags · kg"
              value={`${calc.totalBags} · ${r2(calc.totalKg)}`}
            />
            <SumCell label="Amount" value={money(calc.amount)} />
            <SumCell label="Hamali" value={money(calc.hamali)} />
            <SumCell label="This bill total" value={money(calc.total)} strong />
            {previousBalance > 0 && (
              <SumCell
                label="Previous balance"
                value={money(previousBalance)}
                danger
              />
            )}
            <SumCell
              label={previousBalance > 0 ? "Total due after this bill" : "Balance"}
              value={money(previousBalance + calc.balance)}
              danger={previousBalance + calc.balance > 0.5}
              strong
            />
            {calc.profit !== null && (
              <SumCell label="Profit on this bill" value={money(calc.profit)} />
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending} size="lg">
              {pending ? "Saving…" : "Save bill"}
            </Button>
            <Button
              type="button"
              disabled={pending}
              size="lg"
              onClick={() => submit("save-view")}
            >
              Save &amp; view bill
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
