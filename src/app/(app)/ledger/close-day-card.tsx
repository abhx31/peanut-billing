"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { money } from "@/lib/format";
import { removeClosing, saveClosing } from "./close-day-actions";

type Props = {
  date: string;
  bookCash: number;
  bookBank: number;
  existingCash: string | null;
  existingBank: string | null;
  canEdit: boolean;
};

export function CloseDayCard({
  date,
  bookCash,
  bookBank,
  existingCash,
  existingBank,
  canEdit,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cashStr, setCashStr] = useState(existingCash ?? "");
  const [bankStr, setBankStr] = useState(existingBank ?? "");

  const cashN = cashStr === "" ? null : Number(cashStr);
  const bankN = bankStr === "" ? null : Number(bankStr);
  const cashDiff = cashN != null ? cashN - bookCash : null;
  const bankDiff = bankN != null ? bankN - bookBank : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (cashStr === "" && bankStr === "") {
      toast.error("Enter counted cash or bank balance.");
      return;
    }
    startTransition(async () => {
      const res = await saveClosing({
        date,
        cash: cashN,
        bank: bankN,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Closing saved");
      router.refresh();
    });
  }

  const hasAny = existingCash != null || existingBank != null;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        <SumRow label="Book cash (today)" value={money(bookCash)} />
        <SumRow label="Book bank (today)" value={money(bookBank)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cl-cash">Cash counted in hand (₹)</Label>
          <Input
            id="cl-cash"
            type="number"
            min="0"
            step="0.01"
            value={cashStr}
            onChange={(e) => setCashStr(e.target.value)}
            disabled={!canEdit}
          />
          {cashDiff !== null && (
            <p
              className={`text-xs ${Math.abs(cashDiff) < 0.5 ? "text-success" : "text-destructive"}`}
            >
              {cashDiff === 0
                ? "Matches book."
                : `Difference: ${money(cashDiff)} ${cashDiff > 0 ? "more" : "less"} than book.`}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="cl-bank">Bank / UPI balance (₹, optional)</Label>
          <Input
            id="cl-bank"
            type="number"
            step="0.01"
            value={bankStr}
            onChange={(e) => setBankStr(e.target.value)}
            disabled={!canEdit}
          />
          {bankDiff !== null && (
            <p
              className={`text-xs ${Math.abs(bankDiff) < 0.5 ? "text-success" : "text-destructive"}`}
            >
              {bankDiff === 0
                ? "Matches book."
                : `Difference: ${money(bankDiff)} ${bankDiff > 0 ? "more" : "less"} than book.`}
            </p>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="flex gap-2 flex-wrap">
          <Button type="submit" disabled={pending}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {pending ? "Saving…" : "Save as closing"}
          </Button>
          {hasAny && (
            <ConfirmDestructive
              title={`Remove closing for ${date}?`}
              description="The next day's opening will fall back to a computed value."
              confirmLabel="Remove closing"
              successMessage="Closing removed"
              onConfirm={() => removeClosing({ date })}
              trigger={
                <Button type="button" variant="outline">
                  Remove closing
                </Button>
              }
            />
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        The closing you save becomes the opening of the next day. Save it after all bills
        and expenses of the day are entered.
      </p>
    </form>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
