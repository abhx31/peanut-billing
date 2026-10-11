"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormActions, FormGrid } from "@/components/form";
import { saveFirmGstProfile } from "./actions";
import type { GstProfile } from "@/lib/gst-types";

type Props = { profile: GstProfile; fy: string; nextInvoiceNo: number | null };

export function FirmGstProfileForm({ profile, fy, nextInvoiceNo }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(profile.name ?? "");
  const [gstin, setGstin] = useState(profile.gstin ?? "");
  const [state, setState] = useState(profile.state ?? "");
  const [stateCode, setStateCode] = useState(profile.stateCode ?? "");
  const [fssai, setFssai] = useState(profile.fssai ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [bankHolder, setBankHolder] = useState(profile.bankHolder ?? "");
  const [bankName, setBankName] = useState(profile.bankName ?? "");
  const [bankAccount, setBankAccount] = useState(profile.bankAccount ?? "");
  const [bankIfsc, setBankIfsc] = useState(profile.bankIfsc ?? "");
  const [declaration, setDeclaration] = useState(profile.declaration ?? "");
  const [nextNo, setNextNo] = useState(
    nextInvoiceNo != null ? String(nextInvoiceNo) : "",
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nn = nextNo ? Number(nextNo) : undefined;
    if (nextNo && (!nn || nn < 1)) {
      toast.error("Next invoice number must be ≥ 1.");
      return;
    }
    startTransition(async () => {
      const res = await saveFirmGstProfile({
        name: name.trim(),
        gstin: gstin.trim().toUpperCase(),
        state: state.trim(),
        stateCode: stateCode.trim(),
        fssai: fssai.trim(),
        email: email.trim(),
        address: address.trim(),
        bankHolder: bankHolder.trim(),
        bankName: bankName.trim(),
        bankAccount: bankAccount.trim(),
        bankIfsc: bankIfsc.trim(),
        declaration: declaration.trim(),
        nextInvoiceNo: nn,
        fy,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Firm GST profile saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Firm identity
        </h3>
        <FormGrid cols={3}>
          <Field label="Firm name" htmlFor="firm-name" required>
            <Input id="firm-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="GSTIN" htmlFor="firm-gstin" required>
            <Input
              id="firm-gstin"
              className="font-mono"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="FSSAI no." htmlFor="firm-fssai">
            <Input id="firm-fssai" value={fssai} onChange={(e) => setFssai(e.target.value)} />
          </Field>
          <Field label="E-mail" htmlFor="firm-email">
            <Input
              id="firm-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="State" htmlFor="firm-state">
            <Input id="firm-state" value={state} onChange={(e) => setState(e.target.value)} />
          </Field>
          <Field
            label="State code"
            htmlFor="firm-state-code"
            required
            hint="Determines CGST+SGST vs IGST on each invoice."
          >
            <Input
              id="firm-state-code"
              className="font-mono"
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
            />
          </Field>
          <Field label="Address" htmlFor="firm-addr" span={3}>
            <Textarea
              id="firm-addr"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>
        </FormGrid>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Bank details (printed on invoices)
        </h3>
        <FormGrid cols={2}>
          <Field label="Account holder" htmlFor="firm-bh">
            <Input
              id="firm-bh"
              value={bankHolder}
              onChange={(e) => setBankHolder(e.target.value)}
            />
          </Field>
          <Field label="Bank name" htmlFor="firm-bn">
            <Input
              id="firm-bn"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
          </Field>
          <Field label="A/c no." htmlFor="firm-ba">
            <Input
              id="firm-ba"
              className="font-mono"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
            />
          </Field>
          <Field label="Branch & IFS code" htmlFor="firm-bi">
            <Input
              id="firm-bi"
              className="font-mono"
              value={bankIfsc}
              onChange={(e) => setBankIfsc(e.target.value)}
            />
          </Field>
        </FormGrid>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Invoice settings
        </h3>
        <FormGrid cols={2}>
          <Field
            label={`Next invoice no. for FY ${fy}`}
            htmlFor="firm-next-no"
            hint="Leave blank to start from 1. Set this if you had paper invoices before."
          >
            <Input
              id="firm-next-no"
              type="number"
              min="1"
              step="1"
              value={nextNo}
              onChange={(e) => setNextNo(e.target.value)}
              placeholder="e.g. 37"
            />
          </Field>
          <Field label="Declaration" htmlFor="firm-decl" span={2}>
            <Textarea
              id="firm-decl"
              rows={2}
              value={declaration}
              onChange={(e) => setDeclaration(e.target.value)}
              placeholder="e.g. We declare that this invoice shows the actual price of the goods described…"
            />
          </Field>
        </FormGrid>
      </div>

      <FormActions>
        <Button type="submit" disabled={pending}>
          <Save className="mr-2 h-4 w-4" />
          {pending ? "Saving…" : "Save firm details"}
        </Button>
      </FormActions>
    </form>
  );
}
