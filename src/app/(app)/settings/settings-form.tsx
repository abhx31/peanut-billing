"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormActions, FormGrid } from "@/components/form";
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
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Settings saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormGrid cols={2}>
        <Field label="Firm name" htmlFor="firm" required span={2}>
          <Input id="firm" value={firm} onChange={(e) => setFirm(e.target.value)} />
        </Field>
        <Field
          label="Default hamali per bag (₹)"
          htmlFor="hamali"
          required
          hint="Pre-fills on every new bill. You can still override per bill."
        >
          <Input
            id="hamali"
            type="number"
            min="0"
            step="0.5"
            value={hamali}
            onChange={(e) => setHamali(e.target.value)}
          />
        </Field>
      </FormGrid>
      <FormGrid cols={2}>
        <Field
          label="Opening cash in hand (₹)"
          htmlFor="oc"
          hint="Only used before the first closing is saved; after that the daily ledger uses the latest closing."
        >
          <Input
            id="oc"
            type="number"
            min="0"
            step="0.01"
            value={openCash}
            onChange={(e) => setOpenCash(e.target.value)}
          />
        </Field>
        <Field label="Opening bank / UPI balance (₹)" htmlFor="ob">
          <Input
            id="ob"
            type="number"
            min="0"
            step="0.01"
            value={openBank}
            onChange={(e) => setOpenBank(e.target.value)}
          />
        </Field>
      </FormGrid>
      <FormActions>
        <Button type="submit" disabled={pending}>
          <Save className="mr-2 h-4 w-4" />
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </FormActions>
    </form>
  );
}
