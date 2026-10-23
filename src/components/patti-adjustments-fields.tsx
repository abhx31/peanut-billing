"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
  cdOn: boolean;
  setCdOn: (v: boolean) => void;
  cdPct: string;
  setCdPct: (v: string) => void;
  labOn: boolean;
  setLabOn: (v: boolean) => void;
  labRate: string;
  setLabRate: (v: string) => void;
  brOn: boolean;
  setBrOn: (v: boolean) => void;
  brRate: string;
  setBrRate: (v: string) => void;
  brSign: 1 | -1;
  setBrSign: (v: 1 | -1) => void;
  transportOn: boolean;
  setTransportOn: (v: boolean) => void;
  transport: string;
  setTransport: (v: string) => void;
};

// CD / labour / brokerage / transport adjustments shared by the Patti and
// Sale-Patti edit dialogs. Each field keeps a fixed two-row shape (checkbox +
// label on top, full-width input below) regardless of label length, so the
// grid stays aligned instead of each box wrapping at a different point.
export function PattiAdjustmentsFields({
  cdOn,
  setCdOn,
  cdPct,
  setCdPct,
  labOn,
  setLabOn,
  labRate,
  setLabRate,
  brOn,
  setBrOn,
  brRate,
  setBrRate,
  brSign,
  setBrSign,
  transportOn,
  setTransportOn,
  transport,
  setTransport,
}: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <AdjustBox
        label="CD %"
        on={cdOn}
        onToggle={setCdOn}
        value={cdPct}
        onValueChange={setCdPct}
        step="0.1"
      />
      <AdjustBox
        label="Labour ₹/bag"
        on={labOn}
        onToggle={setLabOn}
        value={labRate}
        onValueChange={setLabRate}
        step="0.5"
      />
      <AdjustBox
        label="Brokerage ₹/bag"
        on={brOn}
        onToggle={setBrOn}
        value={brRate}
        onValueChange={setBrRate}
        step="0.5"
        footer={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setBrSign(brSign === 1 ? -1 : 1)}
            disabled={!brOn}
          >
            {brSign === 1 ? "+ Add" : "− Deduct"}
          </Button>
        }
      />
      <AdjustBox
        label="Transport ₹"
        on={transportOn}
        onToggle={setTransportOn}
        value={transport}
        onValueChange={setTransport}
        step="0.01"
      />
    </div>
  );
}

function AdjustBox({
  label,
  on,
  onToggle,
  value,
  onValueChange,
  step,
  footer,
}: {
  label: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  value: string;
  onValueChange: (v: string) => void;
  step: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${on ? "" : "opacity-70"}`}>
      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onToggle(e.target.checked)}
        />
        {label}
      </label>
      <Input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={!on}
        className="w-full"
      />
      {footer}
    </div>
  );
}
