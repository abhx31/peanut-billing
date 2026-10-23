"use client";

import { Input } from "@/components/ui/input";

type Props = {
  on: boolean;
  onToggle: (v: boolean) => void;
  ratePerBag: string;
  onRateChange: (v: string) => void;
};

// Hamali the firm absorbs itself (e.g. customer won't pay it) — tracked as
// bags × rate for the Hamali tab, but never added to the bill/invoice total.
// Shared by Sale Patti and GST Sale forms/edit dialogs, the only two kinds
// that support this.
export function HamaliOnUsField({ on, onToggle, ratePerBag, onRateChange }: Props) {
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${on ? "" : "opacity-70"}`}>
      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        Hamali ₹/bag (on us — not billed to customer)
      </label>
      <Input
        type="number"
        min="0"
        step="0.5"
        value={ratePerBag}
        onChange={(e) => onRateChange(e.target.value)}
        disabled={!on}
        className="w-full"
      />
    </div>
  );
}
