"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormActions, FormGrid } from "@/components/form";
import { saveGstCustomer } from "./actions";

export function GstCustomerForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  function reset() {
    setName("");
    setGstin("");
    setState("");
    setStateCode("");
    setPhone("");
    setAddress("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Enter the customer name.");
      return;
    }
    startTransition(async () => {
      const res = await saveGstCustomer({
        name: name.trim(),
        gstin: gstin.trim().toUpperCase(),
        state: state.trim(),
        stateCode: stateCode.trim(),
        phone: phone.trim(),
        address: address.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Customer saved");
      reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormGrid cols={3}>
        <Field label="Name" htmlFor="cn" required>
          <Input id="cn" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="GSTIN"
          htmlFor="cg"
          hint="15 characters, uppercase. Required on tax invoices."
        >
          <Input
            id="cg"
            maxLength={15}
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            className="font-mono"
          />
        </Field>
        <Field label="Phone (optional)" htmlFor="cp">
          <Input id="cp" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="State" htmlFor="cs">
          <Input id="cs" value={state} onChange={(e) => setState(e.target.value)} />
        </Field>
        <Field
          label="State code"
          htmlFor="cc"
          hint="2-digit GST state code — determines CGST+SGST vs IGST."
        >
          <Input
            id="cc"
            maxLength={3}
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            className="font-mono"
          />
        </Field>
        <Field label="Address" htmlFor="ca" span={3}>
          <Textarea
            id="ca"
            rows={2}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
      </FormGrid>
      <FormActions>
        <Button type="button" variant="outline" onClick={reset}>
          Clear
        </Button>
        <Button type="submit" disabled={pending}>
          <Save className="mr-2 h-4 w-4" />
          {pending ? "Saving…" : "Save customer"}
        </Button>
      </FormActions>
    </form>
  );
}
