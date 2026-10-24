"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormActions, FormGrid } from "@/components/form";
import { updateSettings } from "./actions";

type Props = {
  firm: string;
  hamaliDefault: number;
  openingCash: number;
  openingBank: number;
  openingCashNm: number;
  openingBankNm: number;
  letterheadImage: string | null;
};

// Max raw bytes before base64 overhead; keeps the data URL under ~1.5 MB after
// base64 (settings is one small row and we send it with every save).
const MAX_IMAGE_BYTES = 1_000_000;

export function SettingsForm(initial: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [firm, setFirm] = useState(initial.firm);
  const [hamali, setHamali] = useState(String(initial.hamaliDefault));
  const [openCash, setOpenCash] = useState(String(initial.openingCash));
  const [openBank, setOpenBank] = useState(String(initial.openingBank));
  const [openCashNm, setOpenCashNm] = useState(String(initial.openingCashNm));
  const [openBankNm, setOpenBankNm] = useState(String(initial.openingBankNm));
  // `undefined` = unchanged, send nothing; `""` = user cleared it; string = new image.
  const [letterhead, setLetterhead] = useState<string | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = letterhead === undefined ? initial.letterheadImage : letterhead || null;

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (JPEG / PNG).");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image is too large. Keep it under 1 MB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") setLetterhead(result);
    };
    reader.onerror = () => toast.error("Could not read the image file.");
    reader.readAsDataURL(file);
  }

  function clearLetterhead() {
    setLetterhead("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hamaliN = Number(hamali);
    const openCashN = Number(openCash);
    const openBankN = Number(openBank);
    const openCashNmN = Number(openCashNm);
    const openBankNmN = Number(openBankNm);
    if (
      !firm.trim() ||
      !Number.isFinite(hamaliN) ||
      !Number.isFinite(openCashN) ||
      !Number.isFinite(openBankN) ||
      !Number.isFinite(openCashNmN) ||
      !Number.isFinite(openBankNmN)
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
        openingCashNm: openCashNmN,
        openingBankNm: openBankNmN,
        letterheadImage: letterhead,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Settings saved");
      setLetterhead(undefined);
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
          label="Main store · opening cash in hand (₹)"
          htmlFor="oc"
          hint="Each store has its own. Only used before that store's first closing is saved; after that its daily ledger uses its latest closing."
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
        <Field label="Main store · opening bank / UPI balance (₹)" htmlFor="ob">
          <Input
            id="ob"
            type="number"
            min="0"
            step="0.01"
            value={openBank}
            onChange={(e) => setOpenBank(e.target.value)}
          />
        </Field>
        <Field label="New Mahavir · opening cash in hand (₹)" htmlFor="ocn">
          <Input
            id="ocn"
            type="number"
            min="0"
            step="0.01"
            value={openCashNm}
            onChange={(e) => setOpenCashNm(e.target.value)}
          />
        </Field>
        <Field label="New Mahavir · opening bank / UPI balance (₹)" htmlFor="obn">
          <Input
            id="obn"
            type="number"
            min="0"
            step="0.01"
            value={openBankNm}
            onChange={(e) => setOpenBankNm(e.target.value)}
          />
        </Field>
      </FormGrid>

      <Field
        label="Letterhead image"
        htmlFor="letterhead"
        hint="Shown as the top banner on every printed bill, patti, hamali and ledger. JPEG or PNG, keep under 1 MB."
      >
        <div className="space-y-2">
          {preview ? (
            <div className="rounded-md border bg-white p-2">
              {/* Letterhead preview — stored as a data URL, rendered as-is. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Letterhead preview"
                className="max-h-40 w-full object-contain"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No letterhead uploaded — prints will show the firm name as plain text.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              id="letterhead"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickFile}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {preview ? "Replace image" : "Upload image"}
            </Button>
            {preview && (
              <Button type="button" variant="ghost" onClick={clearLetterhead}>
                <X className="mr-2 h-4 w-4" />
                Remove
              </Button>
            )}
          </div>
        </div>
      </Field>

      <FormActions>
        <Button type="submit" disabled={pending}>
          <Save className="mr-2 h-4 w-4" />
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </FormActions>
    </form>
  );
}
