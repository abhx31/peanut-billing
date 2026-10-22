import { money } from "@/lib/format";

type Line = { label: string; amount: number };

type Props = {
  debitLabel?: string;
  creditLabel?: string;
  debits: Line[];
  credits: Line[];
};

// Classic two-column cash-book / ledger layout: debits (receipts) on the
// left, credits (payments) on the right, each column totalled at the
// bottom. Plain neutral grays so it reads correctly both on-screen and in
// print — same convention the print pages already use.
export function LedgerTAccount({
  debitLabel = "Receipts (Dr)",
  creditLabel = "Payments (Cr)",
  debits,
  credits,
}: Props) {
  const totalDr = debits.reduce((s, l) => s + l.amount, 0);
  const totalCr = credits.reduce((s, l) => s + l.amount, 0);
  const rows = Math.max(debits.length, credits.length);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-1.5 pr-4 border-b border-gray-300" colSpan={2}>
              {debitLabel}
            </th>
            <th className="py-1.5 pr-4 pl-4 border-b border-l border-gray-300" colSpan={2}>
              {creditLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="border-b border-gray-200 last:border-0">
              <td className="py-1.5 pr-4">{debits[i]?.label ?? ""}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums">
                {debits[i] ? money(debits[i].amount) : ""}
              </td>
              <td className="py-1.5 pr-4 pl-4 border-l border-gray-200">
                {credits[i]?.label ?? ""}
              </td>
              <td className="py-1.5 pr-0 text-right tabular-nums">
                {credits[i] ? money(credits[i].amount) : ""}
              </td>
            </tr>
          ))}
          <tr className="font-semibold border-t-2 border-gray-400">
            <td className="py-1.5 pr-4">Total</td>
            <td className="py-1.5 pr-4 text-right tabular-nums">{money(totalDr)}</td>
            <td className="py-1.5 pr-4 pl-4 border-l border-gray-200">Total</td>
            <td className="py-1.5 pr-0 text-right tabular-nums">{money(totalCr)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
