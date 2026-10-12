"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { money, pad2 } from "@/lib/format";
import { ReceiveFromCustomerButton } from "./receive-from-customer-button";
import { StatementDialog } from "./statement-dialog";

type Pending = {
  id: string;
  no: number;
  kind: "normal" | "gst" | "psale";
  loc: "MS" | "NM";
  date: string;
  total: number;
  balance: number;
};

type Row = {
  name: string;
  openingDue: number;
  openingPaid: number;
  billed: number;
  paid: number;
  totalBalance: number;
  pending: Pending[];
};

function billLabel(p: Pending) {
  const prefix =
    p.kind === "gst" ? "GST " : p.kind === "psale" ? "P " : "";
  return `${prefix}${pad2(p.no)}${p.loc === "NM" ? " (NM)" : ""}`;
}

export function BalancesTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    // If it looks like a bill number ("12", "GST 05", "P 03"), match the row
    // whose pending list contains that bill number.
    const numMatch = needle.match(/\d+/)?.[0];
    const n = numMatch ? Number(numMatch) : null;
    return rows.filter((r) => {
      if (r.name.toLowerCase().includes(needle)) return true;
      if (n !== null && r.pending.some((p) => p.no === n)) return true;
      return false;
    });
  }, [q, rows]);

  const totals = filtered.reduce(
    (acc, r) => ({
      openingDue: acc.openingDue + r.openingDue,
      openingPaid: acc.openingPaid + r.openingPaid,
      billed: acc.billed + r.billed,
      paid: acc.paid + r.paid,
      totalBalance: acc.totalBalance + r.totalBalance,
    }),
    { openingDue: 0, openingPaid: 0, billed: 0, paid: 0, totalBalance: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search customer name or bill number"
          autoComplete="off"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {q ? `No customer or bill matches "${q}".` : "No customers."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4 text-right">Old due</th>
                <th className="py-2 pr-4 text-right">Billed</th>
                <th className="py-2 pr-4 text-right">Paid</th>
                <th className="py-2 pr-4 text-right">Balance</th>
                <th className="py-2 pr-4">Pending bills</th>
                <th className="py-2 pr-0 text-right" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const totalPaid = c.paid + c.openingPaid;
                return (
                  <tr key={c.name} className="border-b last:border-0">
                    <td className="py-2 pr-4">{c.name}</td>
                    <td className="py-2 pr-4 text-right">
                      {c.openingDue > 0.005 ? money(c.openingDue) : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right">{money(c.billed)}</td>
                    <td className="py-2 pr-4 text-right">{money(totalPaid)}</td>
                    <td
                      className={`py-2 pr-4 text-right ${
                        c.totalBalance > 0.5
                          ? "text-destructive font-semibold"
                          : c.totalBalance < -0.5
                            ? "text-success font-semibold"
                            : ""
                      }`}
                    >
                      {money(c.totalBalance)}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {c.pending.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="whitespace-pre-wrap">
                          {c.pending
                            .map((p) => `${billLabel(p)} · ${money(p.balance)}`)
                            .join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-0 text-right">
                      <div className="flex gap-1 justify-end">
                        <StatementDialog customer={c.name} />
                        {c.totalBalance > 0.5 && (
                          <ReceiveFromCustomerButton
                            customer={c.name}
                            balance={c.totalBalance}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="py-2 pr-4">
                  {q ? "Matching customers" : "All customers"}
                </td>
                <td className="py-2 pr-4 text-right">
                  {money(totals.openingDue)}
                </td>
                <td className="py-2 pr-4 text-right">{money(totals.billed)}</td>
                <td className="py-2 pr-4 text-right">
                  {money(totals.paid + totals.openingPaid)}
                </td>
                <td className="py-2 pr-4 text-right">
                  {money(totals.totalBalance)}
                </td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
