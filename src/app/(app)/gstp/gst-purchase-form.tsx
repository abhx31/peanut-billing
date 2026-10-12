"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money, num, r2, today } from "@/lib/format";
import { saveGstPurchase } from "./actions";

type Lot = { id: string; name: string };

type Props = {
  lots: Lot[];
  firmStateCode: string;
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
};

export function GstPurchaseForm({ lots, firmStateCode }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(today());
  const [party, setParty] = useState("");
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [address, setAddress] = useState("");
  const [invNo, setInvNo] = useState("");
  const [invDate, setInvDate] = useState(today());
  const [pct, setPct] = useState("5");
  const [itcOn, setItcOn] = useState(true);
  const [addToStock, setAddToStock] = useState(true);
  const [paidMode, setPaidMode] = useState<"" | "Cash" | "UPI">("");

  // Current line + cart.
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lotId, setLotId] = useState(lots[0]?.id ?? "");
  const [description, setDescription] = useState("Ground Nuts");
  const [hsn, setHsn] = useState("12023090");
  const [bags, setBags] = useState("");
  const [kg, setKg] = useState("");
  const [rate, setRate] = useState("");

  function onGstinChange(v: string) {
    const upper = v.toUpperCase();
    setGstin(upper);
    const m = upper.match(/^(\d{2})/);
    if (m) setStateCode(m[1]);
  }

  const currentLine = useMemo((): CartItem | null => {
    const b = num(bags);
    const k = num(kg);
    const r = num(rate);
    const lot = lots.find((l) => l.id === lotId);
    if (!lot || b <= 0 || k <= 0 || r <= 0) return null;
    return {
      key: "current",
      lotId: lot.id,
      lotName: lot.name,
      description: description.trim() || "Ground Nuts",
      hsn: hsn.trim() || "12023090",
      bags: b,
      kg: k,
      rate: r,
      amount: r2(k * r),
    };
  }, [bags, kg, rate, lotId, description, hsn, lots]);

  const items = useMemo(
    () => (currentLine ? [...cart, currentLine] : cart),
    [cart, currentLine],
  );

  const intra =
    (firmStateCode ?? "").toString().trim() === (stateCode ?? "").toString().trim();

  const calc = useMemo(() => {
    const taxable = r2(items.reduce((s, i) => s + i.amount, 0));
    const totalTax = r2((taxable * num(pct)) / 100);
    const cgst = intra ? r2(totalTax / 2) : 0;
    const sgst = intra ? r2(totalTax - cgst) : 0;
    const igst = intra ? 0 : totalTax;
    const preRound = r2(taxable + cgst + sgst + igst);
    const net = Math.round(preRound);
    const roundOff = r2(net - preRound);
    const bagsTotal = items.reduce((s, i) => s + i.bags, 0);
    const kgTotal = r2(items.reduce((s, i) => s + i.kg, 0));
    const itc = itcOn ? totalTax : 0;
    return {
      bagsTotal,
      kgTotal,
      taxable,
      cgst,
      sgst,
      igst,
      roundOff,
      net,
      itc,
    };
  }, [items, pct, intra, itcOn]);

  function clearLine() {
    setBags("");
    setKg("");
    setRate("");
  }

  function addToCart() {
    if (!currentLine) {
      toast.error("Pick a lot and fill bags, kg and rate.");
      return;
    }
    setCart((xs) => [...xs, { ...currentLine, key: crypto.randomUUID() }]);
    clearLine();
  }

  function removeFromCart(key: string) {
    setCart((xs) => xs.filter((x) => x.key !== key));
  }

  function reset() {
    setParty("");
    setGstin("");
    setState("");
    setStateCode("");
    setAddress("");
    setInvNo("");
    setPct("5");
    setPaidMode("");
    setCart([]);
    clearLine();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!party.trim()) {
      toast.error("Enter supplier name.");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one line.");
      return;
    }
    startTransition(async () => {
      const res = await saveGstPurchase({
        date,
        party: party.trim(),
        supplier: {
          name: party.trim(),
          gstin: gstin.trim(),
          state: state.trim(),
          code: stateCode.trim(),
          address: address.trim(),
        },
        invNo: invNo.trim(),
        invDate: invDate || undefined,
        items: items.map((it) => ({
          lotId: it.lotId,
          description: it.description,
          hsn: it.hsn,
          bags: it.bags,
          kg: it.kg,
          rate: it.rate,
        })),
        pct: num(pct),
        firmCode: firmStateCode,
        itcOn,
        addToStock,
        paidMode: paidMode ?? "",
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Saved GST purchase GP ${res.no} · ${res.fy}`);
      reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 flex-wrap">
            GST purchase bill
            <Badge variant={intra ? "secondary" : "outline"} className="text-xs">
              {intra ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"}
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Record a GST purchase from a supplier. Tick <b>Add bags to my stock</b>{" "}
            to receive the goods into a lot; the stock rises per lot. Tick{" "}
            <b>Tax can be claimed back</b> if you can claim ITC on this purchase.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="gp-date">Date (your records)</Label>
              <Input
                id="gp-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gp-party">Supplier name</Label>
              <Input
                id="gp-party"
                value={party}
                onChange={(e) => setParty(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gp-gstin">Supplier GSTIN</Label>
              <Input
                id="gp-gstin"
                value={gstin}
                onChange={(e) => onGstinChange(e.target.value)}
                className="font-mono uppercase"
                maxLength={15}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gp-code">State code</Label>
              <Input
                id="gp-code"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                className="font-mono"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gp-state">State</Label>
              <Input
                id="gp-state"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-2">
              <Label htmlFor="gp-addr">Supplier address</Label>
              <Input
                id="gp-addr"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gp-inv-no">Supplier invoice no.</Label>
              <Input
                id="gp-inv-no"
                value={invNo}
                onChange={(e) => setInvNo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gp-inv-date">Supplier invoice date</Label>
              <Input
                id="gp-inv-date"
                type="date"
                value={invDate}
                onChange={(e) => setInvDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold mb-2">Lots in this invoice</h2>
            {cart.length > 0 && (
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
                      <th />
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
                        <td className="text-right">
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

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Lot (stock)</Label>
                <Select value={lotId} onValueChange={(v) => setLotId(v ?? "")}>
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
              <div className="space-y-2">
                <Label htmlFor="gp-desc">Description</Label>
                <Input
                  id="gp-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gp-hsn">HSN/SAC</Label>
                <Input
                  id="gp-hsn"
                  value={hsn}
                  onChange={(e) => setHsn(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gp-bags">Bags</Label>
                <Input
                  id="gp-bags"
                  type="number"
                  min="0"
                  step="1"
                  value={bags}
                  onChange={(e) => setBags(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gp-kg">Total kg</Label>
                <Input
                  id="gp-kg"
                  type="number"
                  min="0"
                  step="0.01"
                  value={kg}
                  onChange={(e) => setKg(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gp-rate">Rate per kg (₹)</Label>
                <Input
                  id="gp-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
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
              + Add this lot to the purchase
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <div className="space-y-2">
              <Label>GST rate</Label>
              <Select value={pct} onValueChange={(v) => setPct(v ?? "5")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => `${v ?? "5"}%`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5" label="5%">5%</SelectItem>
                  <SelectItem value="0" label="0%">0%</SelectItem>
                  <SelectItem value="12" label="12%">12%</SelectItem>
                  <SelectItem value="18" label="18%">18%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tax</Label>
              <label className="flex items-center gap-2 text-sm pt-1">
                <input
                  type="checkbox"
                  checked={itcOn}
                  onChange={(e) => setItcOn(e.target.checked)}
                />
                Tax can be claimed back (ITC)
              </label>
            </div>
            <div className="space-y-2">
              <Label>Stock</Label>
              <label className="flex items-center gap-2 text-sm pt-1">
                <input
                  type="checkbox"
                  checked={addToStock}
                  onChange={(e) => setAddToStock(e.target.checked)}
                />
                Add bags to my stock
              </label>
            </div>
            <div className="space-y-2">
              <Label>Payment to supplier</Label>
              <Select
                value={paidMode}
                onValueChange={(v) =>
                  setPaidMode((v as "" | "Cash" | "UPI") ?? "")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) => (!v || v === "" ? "Not paid yet" : (v as string))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="" label="Not paid yet">
                    Not paid yet
                  </SelectItem>
                  <SelectItem value="Cash" label="Cash">Cash</SelectItem>
                  <SelectItem value="UPI" label="UPI">UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <SumCell label="Bags · kg" value={`${calc.bagsTotal} · ${calc.kgTotal}`} />
            <SumCell label="Taxable" value={money(calc.taxable)} />
            {intra ? (
              <>
                <SumCell label={`CGST ${num(pct) / 2}%`} value={money(calc.cgst)} />
                <SumCell label={`SGST ${num(pct) / 2}%`} value={money(calc.sgst)} />
              </>
            ) : (
              <SumCell label={`IGST ${pct}%`} value={money(calc.igst)} />
            )}
            <SumCell label="Round off" value={money(calc.roundOff)} />
            <SumCell label="Total payable" value={money(calc.net)} strong />
            <SumCell label="ITC" value={money(calc.itc)} />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button type="submit" disabled={pending} size="lg">
              {pending ? "Saving…" : "Save GST purchase"}
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
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-lg tabular-nums ${strong ? "font-bold" : "font-semibold"}`}
      >
        {value}
      </div>
    </div>
  );
}
