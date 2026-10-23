"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Printer, Save, ShoppingBasket, SlidersHorizontal, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormSection, FormGrid, Field, FormActions } from "@/components/form";
import { Segmented } from "@/components/segmented";
import { money, num, parseBagWeights, pad2, r2, today } from "@/lib/format";
import { savePatti } from "./actions";

type Props = {
  lotNameSuggestions: string[];
  lots: { id: string; name: string }[];
};

type CartItem = {
  key: string;
  lotName: string;
  weightsText: string;
  bags: number;
  kg: number;
  rate: number;
  amount: number;
};

export function PattiForm({ lotNameSuggestions, lots }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(today());
  const [party, setParty] = useState("");

  // Current line + cart.
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lotName, setLotName] = useState("");
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
  const [brSign, setBrSign] = useState<1 | -1>(-1);
  const [transportOn, setTransportOn] = useState(false);
  const [transport, setTransport] = useState("");
  const [paidMode, setPaidMode] = useState<"" | "Cash" | "UPI" | "CJ">("");
  const [addToStock, setAddToStock] = useState(false);
  const [stockLotId, setStockLotId] = useState(lots[0]?.id ?? "");

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
    if (bagsN <= 0 || kgN <= 0 || rateN <= 0) return null;
    return {
      key: "current",
      lotName: lotName.trim(),
      weightsText: weights.trim(),
      bags: bagsN,
      kg: kgN,
      rate: rateN,
      amount: r2(kgN * rateN),
    };
  }, [bags, kg, rate, lotName, weights]);

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
    return { bagsTotal, kgTotal, amount, cd, labor, broker, trans, net };
  }, [items, cdOn, cdPct, labOn, labRate, brOn, brRate, brSign, transportOn, transport]);

  function clearCurrentLine() {
    setLotName("");
    setBags("");
    setWeights("");
    setKg("");
    setRate("");
  }

  function addToCart() {
    if (!currentLine) {
      toast.error("Fill in bags, weight and price before adding this lot.");
      return;
    }
    setCart((xs) => [...xs, { ...currentLine, key: crypto.randomUUID() }]);
    clearCurrentLine();
  }

  function removeFromCart(key: string) {
    setCart((xs) => xs.filter((x) => x.key !== key));
  }

  function submit(mode: "save" | "save-print") {
    if (!party.trim() || items.length === 0) {
      toast.error("Enter seller name and at least one lot with bags, weight and price.");
      return;
    }
    startTransition(async () => {
      const res = await savePatti({
        date,
        party: party.trim(),
        items: items.map((it) => ({
          lotName: it.lotName,
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
        paidMode: paidMode ?? "",
        addToStock,
        stockLotId: addToStock ? stockLotId : undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Saved patti ${pad2(res.pattiNo)} · net ${money(calc.net)}`);
      if (mode === "save-print") {
        window.open(`/patti/${res.pattiId}/print`, "_blank");
      }
      setParty("");
      setCart([]);
      clearCurrentLine();
      setCdOn(false);
      setLabOn(false);
      setBrOn(false);
      setBrSign(-1);
      setTransportOn(false);
      setTransport("");
      setPaidMode("");
      setAddToStock(false);
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
        icon={ShoppingBasket}
        title="Seller & goods"
        description="Who you bought from. Add one or more lots to this bill. The current line is included automatically on save; use + Add this lot when you have another lot for the same seller."
      >
        <FormGrid cols={2}>
          <Field label="Date" htmlFor="pd" required>
            <Input
              id="pd"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Seller / party name" htmlFor="pn" required>
            <Input id="pn" value={party} onChange={(e) => setParty(e.target.value)} />
          </Field>
        </FormGrid>

        {cart.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4">Lot / quality</th>
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

        <FormGrid cols={3}>
          <Field label="Lot / quality (optional)" htmlFor="pq">
            <Input
              id="pq"
              list="pq-list"
              value={lotName}
              onChange={(e) => setLotName(e.target.value)}
              placeholder="e.g. Bold 40/50"
            />
            <datalist id="pq-list">
              {lotNameSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="No. of bags" htmlFor="pb">
            <Input
              id="pb"
              type="number"
              min="0"
              step="1"
              value={bags}
              onChange={(e) => setBags(e.target.value)}
            />
          </Field>
          <Field label="Total weight (kg)" htmlFor="pk">
            <Input
              id="pk"
              type="number"
              min="0"
              step="0.01"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
            />
          </Field>
          <Field label="Price per kg (₹)" htmlFor="pp">
            <Input
              id="pp"
              type="number"
              min="0"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
          <Field
            label="Each bag's weight (optional)"
            htmlFor="pw"
            span={2}
            hint="Space / comma / newline separated. `50x40.5` means 50 bags of 40.5 kg. Fills bags + total kg for you."
          >
            <Textarea
              id="pw"
              rows={2}
              value={weights}
              onChange={(e) => onWeights(e.target.value)}
              placeholder="40.5 41 50x40.5"
            />
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
          + Add this lot to the patti bill (another lot for the same seller)
        </Button>
      </FormSection>

      <FormSection
        icon={SlidersHorizontal}
        title="Adjustments"
        description="Tick only what applies to this bill. CD, labour and transport reduce the net. Brokerage is a per-bill pick — add or deduct depending on who's paying."
        compact
      >
        <FormGrid cols={4}>
          <AdjustField
            on={cdOn}
            onToggle={setCdOn}
            label="CD %"
            kind="deducted"
            value={cdPct}
            onValueChange={setCdPct}
            step="0.1"
            inputId="pcdp"
            suffix="%"
          />
          <AdjustField
            on={labOn}
            onToggle={setLabOn}
            label="Labour ₹ / bag"
            kind="deducted"
            value={labRate}
            onValueChange={setLabRate}
            step="0.5"
            inputId="plb"
          />
          <AdjustField
            on={brOn}
            onToggle={setBrOn}
            label="Brokerage ₹ / bag"
            kind={brSign === 1 ? "added" : "deducted"}
            value={brRate}
            onValueChange={setBrRate}
            step="0.5"
            inputId="pbr"
            footer={
              <Segmented
                value={brSign === 1 ? "add" : "sub"}
                onChange={(v) => setBrSign(v === "add" ? 1 : -1)}
                disabled={!brOn}
                size="sm"
                className="w-full"
                ariaLabel="Brokerage direction"
                options={[
                  { value: "add", label: "+ Add" },
                  { value: "sub", label: "− Deduct" },
                ]}
              />
            }
          />
          <AdjustField
            on={transportOn}
            onToggle={setTransportOn}
            label="Transport ₹"
            kind="deducted"
            value={transport}
            onValueChange={setTransport}
            step="0.01"
            inputId="ptr"
          />
        </FormGrid>
      </FormSection>

      <FormSection
        title="Add to stock"
        description="Receive the bags into one of your lots. If the patti is later deleted the stock row is removed too. For a multi-lot patti bill the whole quantity goes into the single lot you pick here."
        compact
      >
        <FormGrid cols={3}>
          <Field label="Add to stock">
            <label className="flex items-center gap-2 text-sm pt-1">
              <input
                type="checkbox"
                checked={addToStock}
                onChange={(e) => setAddToStock(e.target.checked)}
                disabled={lots.length === 0}
              />
              Add these {calc.bagsTotal || 0} bags to my stock
            </label>
          </Field>
          {addToStock && (
            <Field label="Lot to add bags to" required span={2}>
              <Select
                value={stockLotId}
                onValueChange={(v) => setStockLotId(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a lot">
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
            </Field>
          )}
        </FormGrid>
      </FormSection>

      <FormSection icon={Wallet} title="Payment to seller" compact>
        <FormGrid cols={3}>
          <Field label="Mode">
            <Select
              value={paidMode}
              onValueChange={(v) => setPaidMode((v as "" | "Cash" | "UPI" | "CJ") ?? "")}
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
                <SelectItem value="CJ" label="CJ">CJ</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Preview" compact>
        <div className="grid gap-3 sm:grid-cols-2">
          <SumCell
            label="Bags · kg"
            value={`${calc.bagsTotal} · ${calc.kgTotal}`}
          />
          <SumCell label="Amount" value={money(calc.amount)} />
          {cdOn && <SumCell label={`CD ${cdPct}% (−)`} value={money(calc.cd)} />}
          {labOn && <SumCell label="Labour (−)" value={money(calc.labor)} />}
          {brOn && (
            <SumCell
              label={`Brokerage (${brSign === 1 ? "+" : "−"})`}
              value={money(calc.broker)}
            />
          )}
          {transportOn && <SumCell label="Transport (−)" value={money(calc.trans)} />}
          <SumCell label="Net payable" value={money(calc.net)} strong />
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
          {pending ? "Saving…" : "Save patti bill"}
        </Button>
      </FormActions>
    </form>
  );
}

function AdjustField({
  on,
  onToggle,
  label,
  kind,
  value,
  onValueChange,
  step,
  inputId,
  suffix,
  footer,
}: {
  on: boolean;
  onToggle: (v: boolean) => void;
  label: string;
  kind: "added" | "deducted";
  value: string;
  onValueChange: (v: string) => void;
  step: string;
  inputId: string;
  suffix?: string;
  footer?: React.ReactNode;
}) {
  const chipColor =
    kind === "added"
      ? "border-success/40 text-success bg-success/10"
      : "border-warning/40 text-warning bg-warning/10";
  return (
    <div
      className={`rounded-lg border bg-background p-3 space-y-2 transition-colors ${on ? "" : "opacity-70"}`}
    >
      <label
        htmlFor={inputId}
        className="flex items-start gap-2 cursor-pointer group/field"
      >
        <Checkbox
          checked={on}
          onCheckedChange={(v) => onToggle(v === true)}
          className="mt-0.5"
        />
        <span className="text-sm font-medium flex-1 min-w-0">
          {label}
          <span
            className={`ml-2 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${chipColor}`}
          >
            {kind === "added" ? "ADD" : "DEDUCT"}
          </span>
        </span>
      </label>
      <div className="relative">
        <Input
          id={inputId}
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={!on}
          className={suffix ? "pr-8" : undefined}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {footer}
    </div>
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
