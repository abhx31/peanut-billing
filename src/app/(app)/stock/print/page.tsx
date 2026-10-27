import { requireSession } from "@/lib/auth-helpers";
import { getLotsWithStock, getSettings, lotStockAt } from "@/lib/queries";
import { getCurrentLoc, locLabel } from "@/lib/loc";
import { fmtDate, r2, today } from "@/lib/format";
import { PrintTrigger } from "../../bills/[id]/print/print-trigger";
import { PrintSizeChooser, PrintSizeToggle } from "@/components/print-size-toggle";
import { PrintLetterhead } from "@/components/print-letterhead";
import { hasPageSize, parsePageSize } from "@/lib/print-size";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ size?: string; d?: string }> };

export default async function PrintStockPage({ searchParams }: Props) {
  await requireSession();
  const sp = await searchParams;
  const size = parsePageSize(sp.size, "A4");
  const chosen = hasPageSize(sp.size);
  const loc = await getCurrentLoc();
  // With a date: the closing stock at the end of that day.
  const asOf = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : undefined;

  const [allLots, settings] = await Promise.all([getLotsWithStock({ asOf }), getSettings()]);
  // Same rows as the Stock page: this store's lots only.
  const lots = allLots
    .map((l) => ({ id: l.id, name: l.name, ...lotStockAt(l, loc) }))
    .filter((l) => l.known);
  const total = (f: (l: (typeof lots)[number]) => number) => lots.reduce((s, l) => s + f(l), 0);

  return (
    <div className="bg-white text-black min-h-screen p-6 mx-auto max-w-3xl text-sm">
      {chosen ? (
        <>
          <PrintSizeToggle current={size} />
          <PrintTrigger />
        </>
      ) : (
        <PrintSizeChooser recommended="A4" />
      )}
      <style>{`@media print { @page { size: ${size}; margin: 10mm; } nav, header { display: none !important; } }`}</style>

      <PrintLetterhead letterheadImage={settings.letterheadImage} firm={settings.firm} />
      <div className="mb-4">
        {asOf ? "Closing stock" : "Stock left"} · {locLabel(loc)} — {fmtDate(asOf ?? today())}
      </div>

      <table className="print-table w-full border-collapse">
        <thead>
          <tr>
            {["Lot / quality", "Added", "Transfers", "Sold", "Left", "Kg sold"].map((h, i) => (
              <th
                key={h}
                className={`border-b border-gray-500 py-1 text-xs whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lots.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-2">
                No stock at {locLabel(loc)}.
              </td>
            </tr>
          ) : (
            lots.map((l) => (
              <tr key={l.id} className="border-b border-gray-200">
                <td className="py-1">{l.name}</td>
                <td className="py-1 text-right">{l.added}</td>
                <td className="py-1 text-right">{l.moved > 0 ? `+${l.moved}` : l.moved}</td>
                <td className="py-1 text-right">{l.sold}</td>
                <td className="py-1 text-right font-semibold">{l.left}</td>
                <td className="py-1 text-right">{r2(l.kgSold)}</td>
              </tr>
            ))
          )}
        </tbody>
        {lots.length > 0 && (
          <tfoot>
            <tr className="font-semibold border-t border-gray-500">
              <td className="py-1">Total ({lots.length} lots)</td>
              <td className="py-1 text-right">{total((l) => l.added)}</td>
              <td className="py-1 text-right">{total((l) => l.moved)}</td>
              <td className="py-1 text-right">{total((l) => l.sold)}</td>
              <td className="py-1 text-right">{total((l) => l.left)}</td>
              <td className="py-1 text-right">{r2(total((l) => l.kgSold))}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
