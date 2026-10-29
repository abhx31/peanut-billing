import { Fragment } from "react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth-helpers";
import { getCustomerStatement, getSettings } from "@/lib/queries";
import { getCurrentLoc, locLabel } from "@/lib/loc";
import { fmtDate, money, pad2 } from "@/lib/format";
import { PrintTrigger } from "../../../bills/[id]/print/print-trigger";
import { PrintSizeChooser, PrintSizeToggle } from "@/components/print-size-toggle";
import { PrintLetterhead } from "@/components/print-letterhead";
import { hasPageSize, parsePageSize } from "@/lib/print-size";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ c?: string; size?: string }> };

export default async function PrintStatementPage({ searchParams }: Props) {
  const sp = await searchParams;
  const customer = (sp.c ?? "").trim();
  if (!customer) notFound();
  await requireSession();

  const size = parsePageSize(sp.size, "A4");
  const chosen = hasPageSize(sp.size);
  const loc = await getCurrentLoc();
  const [data, settings] = await Promise.all([
    getCustomerStatement(customer, loc),
    getSettings(),
  ]);

  return (
    <div className="print:bg-white print:text-black bg-white text-black min-h-screen p-6 print:min-h-0 print:p-0 mx-auto max-w-3xl text-sm">
      {chosen ? (
        <>
          <PrintSizeToggle current={size} />
          <PrintTrigger />
        </>
      ) : (
        <PrintSizeChooser recommended="A4" />
      )}
      <style>{`@media print { @page { size: ${size}; margin: 10mm; } nav, header, aside { display: none !important; } }`}</style>

      <PrintLetterhead letterheadImage={settings.letterheadImage} firm={settings.firm} />
      <div className="mb-4">
        <b>STATEMENT OF ACCOUNT</b> · {locLabel(loc)}
        <br />
        Customer: <b>{data.customer}</b>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4 text-xs">
        <Tile label="Old due" value={money(data.totals.openingDue)} />
        <Tile label="Billed" value={money(data.totals.billed)} />
        <Tile label="Received" value={money(data.totals.received)} />
        <Tile label="Balance" value={money(data.totals.balance)} strong />
      </div>

      <table className="print-table w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left border-b border-gray-500 py-1">Date</th>
            <th className="text-left border-b border-gray-500 py-1">Entry</th>
            <th className="text-left border-b border-gray-500 py-1">Applied to / note</th>
            <th className="text-left border-b border-gray-500 py-1">Mode</th>
            <th className="text-right border-b border-gray-500 py-1">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-2 text-gray-500">
                No entries for this customer.
              </td>
            </tr>
          )}
          {data.rows.map((r) => {
            if (r.kind === "due") {
              return (
                <tr key={`due-${r.id}`}>
                  <td className="py-1">{fmtDate(r.date)}</td>
                  <td className="py-1">Old due</td>
                  <td className="py-1 text-gray-500">{r.note ?? ""}</td>
                  <td className="py-1" />
                  <td className="py-1 text-right">{money(r.amount)}</td>
                </tr>
              );
            }
            if (r.kind === "bill") {
              return (
                <tr key={`bill-${r.id}`}>
                  <td className="py-1">{fmtDate(r.date)}</td>
                  <td className="py-1 font-mono">
                    Bill {r.billKind === "gst" ? "GST " : ""}
                    {r.billKind === "psale" ? "P " : ""}
                    {pad2(r.billNo)}
                  </td>
                  <td className="py-1" />
                  <td className="py-1" />
                  <td className="py-1 text-right">{money(r.total)}</td>
                </tr>
              );
            }
            // The day's total received, then (if it cleared more than one
            // bill / old due) one indented line per part.
            const split = r.parts.length > 1;
            return (
              <Fragment key={`rcpt-${r.id}`}>
                <tr>
                  <td className="py-1">{fmtDate(r.date)}</td>
                  <td className="py-1 font-semibold">Received</td>
                  <td className="py-1 text-gray-500">
                    {split ? "" : r.appliedTo}
                    {!split && r.note ? ` — ${r.note}` : ""}
                  </td>
                  <td className="py-1">{r.mode}</td>
                  <td className="py-1 text-right font-semibold">−{money(r.amount)}</td>
                </tr>
                {split &&
                  r.parts.map((p, i) => (
                    <tr key={`rcpt-${r.id}-${i}`} className="text-gray-600">
                      <td className="py-0.5" />
                      <td className="py-0.5 pl-3">cleared</td>
                      <td className="py-0.5">
                        {p.label}
                        {p.note ? ` — ${p.note}` : ""}
                      </td>
                      <td className="py-0.5">{p.mode}</td>
                      <td className="py-0.5 text-right">−{money(p.amount)}</td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="pt-2 border-t border-gray-500" colSpan={4}>
              Balance due
            </td>
            <td className="pt-2 border-t border-gray-500 text-right">
              {money(data.totals.balance)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="border border-gray-300 rounded p-2">
      <div className="text-gray-500">{label}</div>
      <div className={strong ? "font-bold" : "font-semibold"}>{value}</div>
    </div>
  );
}
