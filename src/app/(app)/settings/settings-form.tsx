"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSettings } from "./actions";

type Props = {
  firm: string;
  hamaliDefault: number;
  openingCash: number;
  openingBank: number;
};

export function SettingsForm(initial: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [firm, setFirm] = useState(initial.firm);
  const [hamali, setHamali] = useState(String(initial.hamaliDefault));
  const [openCash, setOpenCash] = useState(String(initial.openingCash));
  const [openBank, setOpenBank] = useState(String(initial.openingBank));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hamaliN = Number(hamali);
    const openCashN = Number(openCash);
    const openBankN = Number(openBank);
    if (
      !firm.trim() ||
      !Number.isFinite(hamaliN) ||
      !Number.isFinite(openCashN) ||
      !Number.isFinite(openBankN)
    ) {
      toast.error("Fill all fields with valid values.");
      return;
    }
    startTransition(async () => {
      const res = await updateSettings({
        firm: firm.trim(),
        hamaliDefault: hamaliN,
        openingCash: openCashN,
        openingBank: openBankN,
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Settings saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="firm">Firm name</Label>
        <Input id="firm" value={firm} onChange={(e) => setFirm(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="hamali">Default hamali per bag (₹)</Label>
        <Input
          id="hamali"
          type="number"
          min="0"
          step="0.5"
          value={hamali}
          onChange={(e) => setHamali(e.target.value)}
        />
      </div>
      <div className="space-y-2" />
      <div className="space-y-2">
        <Label htmlFor="oc">Opening cash in hand (₹)</Label>
        <Input
          id="oc"
          type="number"
          min="0"
          step="0.01"
          value={openCash}
          onChange={(e) => setOpenCash(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ob">Opening bank / UPI balance (₹)</Label>
        <Input
          id="ob"
          type="number"
          min="0"
          step="0.01"
          value={openBank}
          onChange={(e) => setOpenBank(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
