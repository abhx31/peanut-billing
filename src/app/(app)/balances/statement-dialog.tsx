"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fmtDate, money, pad2 } from "@/lib/format";
import { fetchStatement } from "./statement-actions";

type Row = Awaited<ReturnType<typeof fetchStatement>>;

export function StatementDialog({ customer }: { customer: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Row | null>(null);
  const [pending, startTransition] = useTransition();
  // Receipt days whose breakdown is open.
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());

  function toggleDay(id: string) {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function load() {
    startTransition(async () => {
      const res = await fetchStatement(customer);
      setData(res);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load();
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            <FileText className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Statement</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span>Statement — {customer}</span>
            <Link
              href={`/balances/statement/print?c=${encodeURIComponent(customer)}`}
              target="_blank"
            >
              <Button type="button" size="sm" variant="outline">
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print
              </Button>
            </Link>
          </DialogTitle>
          <DialogDescription>
            Every old due, bill and receipt for this customer, in date order. Each day&apos;s
            receipts are one total — click it to see which bills it cleared.
          </DialogDescription>
        </DialogHeader>

        {pending || !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <Tile label="Old due" value={money(data.totals.openingDue)} />
              <Tile label="Billed" value={money(data.totals.billed)} />
              <Tile label="Received" value={money(data.totals.received)} />
              <Tile
                label="Balance"
                value={money(data.totals.balance)}
                tone={data.totals.balance > 0.5 ? "warn" : undefined}
                strong
              />
            </div>

            <div className="overflow-x-auto mt-4 max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Entry</th>
                    <th className="py-2 pr-4">Applied to</th>
                    <th className="py-2 pr-4">Mode</th>
                    <th className="py-2 pr-4">Note</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-3 text-muted-foreground">
                        No entries for this customer.
                      </td>
                    </tr>
                  )}
                  {data.rows.map((r) => {
                    if (r.kind === "due") {
                      return (
                        <tr key={`due-${r.id}`} className="border-b last:border-0">
                          <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="py-2 pr-4">Old due</td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {r.note ?? ""}
                          </td>
                          <td className="py-2 pr-4" />
                          <td className="py-2 pr-4" />
                          <td className="py-2 pr-4 text-right">
                            {money(r.amount)}
                          </td>
                        </tr>
                      );
                    }
                    if (r.kind === "bill") {
                      return (
                        <tr key={`bill-${r.id}`} className="border-b last:border-0">
                          <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="py-2 pr-4 whitespace-nowrap">
                            Bill{" "}
                            <span className="font-mono">
                              {r.billKind === "gst" ? "GST " : ""}
                              {r.billKind === "psale" ? "P " : ""}
                              {pad2(r.billNo)}
                            </span>
                          </td>
                          <td className="py-2 pr-4" />
                          <td className="py-2 pr-4" />
                          <td className="py-2 pr-4" />
                          <td className="py-2 pr-4 text-right">
                            {money(r.total)}
                          </td>
                        </tr>
                      );
                    }
                    // receipt — the day's total received; opens into what it
                    // cleared when it covered more than one bill / old due.
                    const canOpen = r.parts.length > 1;
                    const isOpen = openDays.has(r.id);
                    return (
                      <Fragment key={`rcpt-${r.id}`}>
                        <tr
                          className={`border-b last:border-0 text-success ${canOpen ? "cursor-pointer hover:bg-muted/40" : ""}`}
                          onClick={canOpen ? () => toggleDay(r.id) : undefined}
                          aria-expanded={canOpen ? isOpen : undefined}
                        >
                          <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="py-2 pr-4 font-medium whitespace-nowrap">
                            {canOpen &&
                              (isOpen ? (
                                <ChevronDown className="inline h-3.5 w-3.5 mr-1" />
                              ) : (
                                <ChevronRight className="inline h-3.5 w-3.5 mr-1" />
                              ))}
                            Received
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs">
                            {canOpen ? `${r.parts.length} entries` : r.appliedTo}
                          </td>
                          <td className="py-2 pr-4">{r.mode}</td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground">
                            {canOpen ? "" : (r.note ?? "")}
                          </td>
                          <td className="py-2 pr-4 text-right font-semibold whitespace-nowrap">
                            −{money(r.amount)}
                          </td>
                        </tr>
                        {canOpen &&
                          isOpen &&
                          r.parts.map((p, i) => (
                            <tr
                              key={`rcpt-${r.id}-${i}`}
                              className="border-b last:border-0 bg-muted/30 text-xs"
                            >
                              <td className="py-1.5 pr-4" />
                              <td className="py-1.5 pr-4 pl-5 text-muted-foreground">cleared</td>
                              <td className="py-1.5 pr-4 font-mono">{p.label}</td>
                              <td className="py-1.5 pr-4">{p.mode}</td>
                              <td className="py-1.5 pr-4 text-muted-foreground">{p.note ?? ""}</td>
                              <td className="py-1.5 pr-4 text-right whitespace-nowrap">
                                −{money(p.amount)}
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Tile({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "warn";
  strong?: boolean;
}) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`tabular-nums whitespace-nowrap ${strong ? "font-bold" : "font-semibold"} ${tone === "warn" ? "text-destructive" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
