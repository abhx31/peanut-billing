"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDestructive } from "@/components/confirm-destructive";
import { fmtDate, money } from "@/lib/format";
import type { CloseResult, StoreCounts } from "@/lib/year-close";
import {
  confirmArchiveAction,
  createArchiveAction,
  discardArchiveAction,
  previewYearCloseAction,
} from "./year-close-actions";

export type ArchiveRow = {
  fy: string;
  status: "pending" | "closed";
  createdAt: string;
  bills: number;
  owedBills: number;
  owedDue: number;
  archiveBytes: number;
};

type Props = {
  next: { fy: string; end: string; canClose: boolean } | null;
  /** Each store's book cash/bank on the last day, to prefill the count. */
  counts: StoreCounts;
  archives: ArchiveRow[];
};

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export async function downloadArchive(fy: string, format: "json" | "csv") {
  try {
    const res = await fetch(`/api/archive/${fy}?format=${format}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = format === "csv" ? `bills-${fy}.csv` : `archive-${fy}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast.error("Download failed: " + (err instanceof Error ? err.message : "unknown"));
  }
}

export function YearCloseCard({ next, counts, archives }: Props) {
  const pending = archives.find((a) => a.status === "pending");

  return (
    <div className="space-y-4">
      {pending ? (
        <PendingArchive a={pending} />
      ) : next?.canClose ? (
        <CreateArchiveDialog fy={next.fy} end={next.end} counts={counts} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {next ? `${next.fy} can be archived after ${next.end}.` : "Nothing to archive yet."}
        </p>
      )}

      {archives.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4">Year</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Archived on</th>
                <th className="py-2 pr-4 text-right">Settled bills</th>
                <th className="py-2 pr-4 text-right">Size</th>
                <th className="py-2 pr-0" />
              </tr>
            </thead>
            <tbody>
              {archives.map((a) => (
                <tr key={a.fy} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{a.fy}</td>
                  <td className="py-2 pr-4">
                    {a.status === "pending" ? (
                      <Badge variant="outline">Waiting for check</Badge>
                    ) : (
                      <Badge variant="secondary">Closed</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-4">{fmtDate(a.createdAt.slice(0, 10))}</td>
                  <td className="py-2 pr-4 text-right">{a.bills}</td>
                  <td className="py-2 pr-4 text-right">{kb(a.archiveBytes)}</td>
                  <td className="py-2 pr-0">
                    <ArchiveLinks fy={a.fy} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ArchiveLinks({ fy }: { fy: string }) {
  return (
    <div className="flex gap-2 justify-end flex-wrap">
      <Link href={`/archive/${fy}`}>
        <Button type="button" size="sm" variant="outline">
          View
        </Button>
      </Link>
      <Button type="button" size="sm" variant="outline" onClick={() => downloadArchive(fy, "csv")}>
        CSV
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => downloadArchive(fy, "json")}>
        JSON
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Step 1: create the archive (nothing is removed).

const STORES = [
  { loc: "MS", name: "Main store" },
  { loc: "NM", name: "New Mahavir" },
] as const;

function CreateArchiveDialog({
  fy,
  end,
  counts,
}: {
  fy: string;
  end: string;
  counts: StoreCounts;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Text inputs per store: [cash, bank].
  const [inputs, setInputs] = useState({
    MS: { cash: String(counts.MS.cash), bank: String(counts.MS.bank) },
    NM: { cash: String(counts.NM.cash), bank: String(counts.NM.bank) },
  });
  const [preview, setPreview] = useState<CloseResult | null>(null);

  const values = () => ({
    fy,
    counts: {
      MS: { cash: Number(inputs.MS.cash), bank: Number(inputs.MS.bank) },
      NM: { cash: Number(inputs.NM.cash), bank: Number(inputs.NM.bank) },
    },
  });
  const valid = Object.values(inputs).every((s) =>
    [s.cash, s.bank].every((v) => v.trim() !== "" && Number.isFinite(Number(v))),
  );
  function setInput(loc: "MS" | "NM", field: "cash" | "bank", v: string) {
    setInputs((prev) => ({ ...prev, [loc]: { ...prev[loc], [field]: v } }));
    setPreview(null);
  }

  function runPreview() {
    if (!valid) {
      toast.error("Enter cash in hand and bank balance for both stores.");
      return;
    }
    startTransition(async () => {
      const res = await previewYearCloseAction(values());
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPreview(res.result);
    });
  }

  function runCreate() {
    startTransition(async () => {
      const res = await createArchiveAction(values());
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${fy} archive created. Check it, then confirm below.`);
      setOpen(false);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setPreview(null);
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Archive className="mr-2 h-4 w-4" />
            Archive {fy}…
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Step 1 of 2: archive {fy}</DialogTitle>
          <DialogDescription>
            This makes a copy of {fy} for you to check. Nothing is removed yet. Entries dated in{" "}
            {fy} are locked until you confirm or discard the archive.
          </DialogDescription>
        </DialogHeader>

        {STORES.map((s) => (
          <div key={s.loc} className="space-y-2">
            <div className="text-sm font-medium">{s.name}</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`yc-cash-${s.loc}`}>Cash in hand on {end}</Label>
                <Input
                  id={`yc-cash-${s.loc}`}
                  inputMode="decimal"
                  value={inputs[s.loc].cash}
                  onChange={(e) => setInput(s.loc, "cash", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`yc-bank-${s.loc}`}>Bank / UPI on {end}</Label>
                <Input
                  id={`yc-bank-${s.loc}`}
                  inputMode="decimal"
                  value={inputs[s.loc].bank}
                  onChange={(e) => setInput(s.loc, "bank", e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Filled in from each store&apos;s ledger. Change them if your count was different.
        </p>

        {preview && <PreviewSummary r={preview} end={end} />}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {preview ? (
            <Button type="button" disabled={pending} onClick={runCreate}>
              {pending ? "Creating…" : "Create archive"}
            </Button>
          ) : (
            <Button type="button" disabled={pending} onClick={runPreview}>
              {pending ? "Checking…" : "Check what will happen"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Step 2: the owner checks the archive, then removes its rows or discards it.

function PendingArchive({ a }: { a: ArchiveRow }) {
  return (
    <div className="space-y-3 rounded-md border border-amber-500/50 bg-amber-500/5 p-4 text-sm">
      <div className="font-medium">Step 2 of 2: check the {a.fy} archive</div>
      <p className="text-muted-foreground">
        Archived on {fmtDate(a.createdAt.slice(0, 10))}. Nothing has been removed from the live data yet,
        and entries dated in {a.fy} are locked until you finish.
      </p>
      <ol className="list-decimal pl-5 text-muted-foreground space-y-1">
        <li>Open the archive or download the bills CSV and compare it with your books.</li>
        <li>
          If everything is correct, remove {a.fy} from the live data. If something is wrong,
          discard the archive, fix the entries, and archive again.
        </li>
      </ol>
      <p>
        {a.bills} settled bills will be removed. {a.owedBills} bills still owed (
        {money(a.owedDue)}) stay live.
      </p>
      <div className="flex gap-2 flex-wrap">
        <ArchiveLinks fy={a.fy} />
        <ConfirmRemoveDialog fy={a.fy} />
        <ConfirmDestructive
          title={`Discard the ${a.fy} archive?`}
          description={`Nothing is removed from the live data. ${a.fy} unlocks so you can fix entries and archive it again.`}
          confirmLabel="Discard archive"
          successMessage={`${a.fy} archive discarded.`}
          onConfirm={() => discardArchiveAction({ fy: a.fy })}
          trigger={
            <Button type="button" size="sm" variant="outline">
              Discard archive
            </Button>
          }
        />
      </div>
    </div>
  );
}

function ConfirmRemoveDialog({ fy }: { fy: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState(false);
  const [confirm, setConfirm] = useState("");

  function runRemove() {
    startTransition(async () => {
      const res = await confirmArchiveAction({ fy, confirm, checked });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${fy} closed. Downloading the final archive file…`);
      setOpen(false);
      router.refresh();
      await downloadArchive(fy, "json");
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setChecked(false);
          setConfirm("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" size="sm">
            Data is correct — remove {fy}…
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {fy} from the live data</DialogTitle>
          <DialogDescription>
            The settled records in the archive are removed from the live data. Bills with a
            balance, old dues and unpaid patti stay. If any record changed since the archive was
            made, nothing is removed. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
          <span>I have checked the {fy} archive and the data is correct.</span>
        </label>
        <div className="space-y-2">
          <Label htmlFor="yc-confirm">Type {fy} to confirm</Label>
          <Input
            id="yc-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || !checked || confirm.trim() !== fy}
            onClick={runRemove}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? "Removing…" : `Remove ${fy}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewSummary({ r, end }: { r: CloseResult; end: string }) {
  const rm = r.removed;
  const removedLines = [
    rm.bills && `${rm.bills} settled bills (${rm.payments} payments)`,
    rm.openingDues && `${rm.openingDues} settled old dues`,
    rm.pattiBills && `${rm.pattiBills} paid patti bills`,
    rm.expenses && `${rm.expenses} expenses`,
    rm.stockIn && `${rm.stockIn} stock entries`,
    rm.transfers && `${rm.transfers} transfers`,
    rm.cjSettlements && `${rm.cjSettlements} CJ settlements`,
    rm.closings && `${rm.closings} day closings`,
  ].filter(Boolean) as string[];
  const so = r.stillOpen;
  const main = r.carry.stock.reduce((s, l) => s + l.main, 0);
  const nm = r.carry.stock.reduce((s, l) => s + l.nm, 0);

  return (
    <div className="space-y-3 rounded-md border p-3 text-sm">
      <Section title="Goes into the archive (removed only after your check)">
        {removedLines.length ? removedLines.map((l) => <li key={l}>{l}</li>) : <li>Nothing</li>}
      </Section>
      <Section title="Stays live (still owed)">
        <li>
          {so.bills} bills with a balance · {money(so.billsDue)} due
        </li>
        {so.oldDues > 0 && (
          <li>
            {so.oldDues} old dues · {money(so.oldDuesDue)} due
          </li>
        )}
        {so.patti > 0 && (
          <li>
            {so.patti} unpaid patti bills · {money(so.pattiDue)}
          </li>
        )}
      </Section>
      <Section title="Carried forward when removed">
        <li>
          Main store: cash {money(r.carry.closing.cash)} and bank {money(r.carry.closing.bank)}{" "}
          saved as the {end} closing
        </li>
        {r.carry.closingNm && (
          <li>
            New Mahavir: cash {money(r.carry.closingNm.cash)} and bank{" "}
            {money(r.carry.closingNm.bank)} saved as the {end} closing
          </li>
        )}
        {r.carry.stock.length > 0 && (
          <li>
            Opening stock for {r.carry.stock.length} lots (Main {main} bags
            {nm ? `, New Mahavir ${nm} bags` : ""})
          </li>
        )}
        {r.carry.cjMoved !== 0 && (
          <li>Main store CJ money held: {money(r.carry.cjOpening)} brought forward</li>
        )}
        {(r.carry.cjMovedNm ?? 0) !== 0 && (
          <li>New Mahavir CJ money held: {money(r.carry.cjOpeningNm ?? 0)} brought forward</li>
        )}
      </Section>
      <p className="text-muted-foreground">
        Archive size: {kb(r.archiveBytes)} (from {kb(r.rawBytes)})
      </p>
      <p className="flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
        Checked: each store&apos;s customer credit, old dues, unpaid patti, cash, bank, CJ and
        stock will all stay exactly the same.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-medium">{title}</div>
      <ul className="list-disc pl-5 text-muted-foreground">{children}</ul>
    </div>
  );
}
