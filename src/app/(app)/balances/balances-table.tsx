"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/format";
import { ReceiveFromCustomerButton } from "./receive-from-customer-button";

type Row = {
  name: string;
  billed: number;
  paid: number;
  balance: number;
};

export function BalancesTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(needle));
  }, [q, rows]);

  const totalBilled = filtered.reduce((s, c) => s + c.billed, 0);
  const totalPaid = filtered.reduce((s, c) => s + c.paid, 0);
  const totalBalance = filtered.reduce((s, c) => s + c.balance, 0);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search customer name"
          autoComplete="off"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {q ? `No customer matches "${q}".` : "No customers."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4 text-right">Total billed</th>
                <th className="py-2 pr-4 text-right">Paid</th>
                <th className="py-2 pr-4 text-right">Balance</th>
                <th className="py-2 pr-0" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.name} className="border-b last:border-0">
                  <td className="py-2 pr-4">{c.name}</td>
                  <td className="py-2 pr-4 text-right">{money(c.billed)}</td>
                  <td className="py-2 pr-4 text-right">{money(c.paid)}</td>
                  <td
                    className={`py-2 pr-4 text-right ${c.balance > 0.5 ? "text-destructive font-semibold" : ""}`}
                  >
                    {money(c.balance)}
                  </td>
                  <td className="py-2 pr-0 text-right">
                    {c.balance > 0.5 && (
                      <ReceiveFromCustomerButton
                        customer={c.name}
                        balance={c.balance}
                      />
                    )}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-4">
                  {q ? "Matching customers" : "All customers"}
                </td>
                <td className="py-2 pr-4 text-right">{money(totalBilled)}</td>
                <td className="py-2 pr-4 text-right">{money(totalPaid)}</td>
                <td className="py-2 pr-4 text-right">{money(totalBalance)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
