import { requireSession } from "@/lib/auth-helpers";
import { getHamaliForDate, getHamaliPaidForDate } from "@/lib/queries-hamali";
import { getSettings } from "@/lib/queries";
import { money, pad2, today } from "@/lib/format";
import { PrintTrigger } from "../../bills/[id]/print/print-trigger";
import { PrintSizeChooser, PrintSizeToggle } from "@/components/print-size-toggle";
import { PrintLetterhead } from "@/components/print-letterhead";
import { hasPageSize, parsePageSize } from "@/lib/print-size";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ d?: string; size?: string }> };

export default async function PrintHamaliPage({ searchParams }: Props) {
  await requireSession();
  const sp = await searchParams;
  const date = sp.d || today();
  const size = parsePageSize(sp.size, "A5");
  const chosen = hasPageSize(sp.size);
  const [h, paid, settings] = await Promise.all([
    getHamaliForDate(date),
    getHamaliPaidForDate(date),
    getSettings(),
  ]);

  return (
    <div className="print:bg-white print:text-black bg-white text-black min-h-screen p-6 mx-auto max-w-3xl text-sm">
      {chosen ? (
        <>
          <PrintSizeToggle current={size} />
          <PrintTrigger />
        </>
      ) : (
        <PrintSizeChooser recommended="A5" />
      )}
      <style>{`@media print { @page { size: ${size} portrait; margin: 10mm; } nav, header, aside { display: none !important; } }`}</style>

      <PrintLetterhead letterheadImage={settings.letterheadImage} firm={settings.firm} />
      <div className="mb-4">
        <b>HAMALI STATEMENT</b>
        <br />
        Date: <b>{date}</b>
      </div>

      {h.bills.length === 0 ? (
        <p className="text-sm">No hamali recorded on this date.</p>
      ) : (
        <table className="w-full border-collapse mb-3">
          <thead>
            <tr>
              <th className="text-left border-b border-gray-500 py-1">Bill no.</th>
              <th className="text-left border-b border-gray-500 py-1">Customer</th>
              <th className="text-right border-b border-gray-500 py-1">Bags</th>
              <th className="text-right border-b border-gray-500 py-1">₹ / bag</th>
              <th className="text-right border-b border-gray-500 py-1">Hamali</th>
            </tr>
          </thead>
          <tbody>
            {h.bills.map((b) => (
              <tr key={b.id}>
                <td className="py-1 font-mono">
                  {b.kind === "gst" ? "GST " : ""}
                  {pad2(b.no)}
                  {b.loc === "NM" ? " (NM)" : ""}
                </td>
                <td className="py-1">{b.customer}</td>
                <td className="py-1 text-right">{b.bags}</td>
                <td className="py-1 text-right">{money(b.hamaliPerBag)}</td>
                <td className="py-1 text-right">{money(b.hamali)}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="py-1 border-t border-gray-500">Total</td>
              <td className="border-t border-gray-500" />
              <td className="py-1 text-right border-t border-gray-500">{h.totalBags}</td>
              <td className="border-t border-gray-500" />
              <td className="py-1 text-right border-t border-gray-500">
                {money(h.totalAmount)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="text-right text-sm space-y-1 mt-4">
        <div>Bags: {h.totalBags}</div>
        <div className="font-bold text-base">Total hamali: {money(h.totalAmount)}</div>
        {paid ? (
          <div>
            Paid: <b>{money(paid.amount)}</b> ({paid.mode})
            {paid.date ? ` on ${paid.date}` : ""}
          </div>
        ) : (
          h.totalAmount > 0 && <div className="font-semibold">Not paid yet</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-8 mt-16 text-xs">
        <div className="border-t border-black pt-2 text-center">Received by (hamali)</div>
        <div className="border-t border-black pt-2 text-center">Paid by (firm)</div>
      </div>
    </div>
  );
}
