import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/queries";
import { fmtDate, money, pad2, r2 } from "@/lib/format";
import { PrintTrigger } from "../../../bills/[id]/print/print-trigger";
import { PrintSizeChooser, PrintSizeToggle } from "@/components/print-size-toggle";
import { PrintLetterhead } from "@/components/print-letterhead";
import { BagWeightsList } from "@/components/bag-weights-list";
import { hasPageSize, parsePageSize } from "@/lib/print-size";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ size?: string }>;
};

export default async function PrintPattiPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const size = parsePageSize(sp.size, "A5");
  const chosen = hasPageSize(sp.size);
  await requireOwnerOrEditor();
  const [patti, settings] = await Promise.all([
    db.query.pattiBills.findFirst({ where: eq(schema.pattiBills.id, id) }),
    getSettings(),
  ]);
  if (!patti) notFound();

  const brSign = patti.brSign === 1 ? "+" : "−";
  const brokerLine = Number(patti.broker) > 0
    ? `Brokerage ₹${Number(patti.brRate)} × ${patti.bags} bags (${brSign})`
    : null;

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
      <style>{`@media print { @page { size: ${size}; margin: 10mm; } nav, header, aside { display: none !important; } }`}</style>

      <PrintLetterhead letterheadImage={settings.letterheadImage} firm={settings.firm} />
      <div className="mb-4">
        <b>PATTI BILL (Purchase)</b>
        <br />
        Patti no. <b>{pad2(patti.no)}</b> &nbsp;·&nbsp; Period: {patti.fy} &nbsp;·&nbsp;
        Date: {fmtDate(patti.date)}
        <br />
        Seller: <b>{patti.party}</b>
      </div>

      {(() => {
        type Line = {
          lotName?: string;
          weightsText?: string;
          bags: number;
          kg: number;
          rate: number;
          amount: number;
        };
        // Prefer the stored items[] (v2 multi-lot patti); fall back to the
        // top-level fields for older single-line pattis.
        const lines: Line[] = Array.isArray(patti.items)
          ? (patti.items as unknown as Line[])
          : [
              {
                lotName: patti.lotName ?? "",
                weightsText: patti.weightsText ?? "",
                bags: patti.bags,
                kg: Number(patti.kg),
                rate: Number(patti.rate),
                amount: Number(patti.amount),
              },
            ];
        const multi = lines.length > 1;
        return (
          <>
            <table className="print-table w-full text-sm border-collapse mb-3">
              <thead>
                <tr>
                  <th className="text-left border-b border-gray-500 py-1">Item</th>
                  <th className="text-right border-b border-gray-500 py-1">Bags</th>
                  <th className="text-right border-b border-gray-500 py-1">Weight (kg)</th>
                  <th className="text-right border-b border-gray-500 py-1">Price/kg</th>
                  <th className="text-right border-b border-gray-500 py-1">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1">{l.lotName || "Peanuts"}</td>
                    <td className="text-right py-1">{l.bags}</td>
                    <td className="text-right py-1">{r2(Number(l.kg))}</td>
                    <td className="text-right py-1">{money(l.rate)}</td>
                    <td className="text-right py-1">{money(l.amount)}</td>
                  </tr>
                ))}
                {multi && (
                  <tr className="font-semibold">
                    <td className="py-1 border-t border-gray-500">Total</td>
                    <td className="text-right py-1 border-t border-gray-500">
                      {patti.bags}
                    </td>
                    <td className="text-right py-1 border-t border-gray-500">
                      {r2(Number(patti.kg))}
                    </td>
                    <td className="border-t border-gray-500" />
                    <td className="text-right py-1 border-t border-gray-500">
                      {money(patti.amount)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <BagWeightsList
              lines={lines.map((l, i) => ({
                label: l.lotName || "Line " + (i + 1),
                weightsText: l.weightsText ?? "",
              }))}
            />
          </>
        );
      })()}

      <div className="text-right text-sm space-y-1">
        <div>Amount: {money(patti.amount)}</div>
        {Number(patti.cd) > 0 && (
          <div>
            CD {Number(patti.cdPct)}% (−): {money(patti.cd)}
          </div>
        )}
        {Number(patti.labor) > 0 && (
          <div>
            Labour ₹{Number(patti.labRate)} × {patti.bags} bags (−): {money(patti.labor)}
          </div>
        )}
        {brokerLine && (
          <div>
            {brokerLine}: {money(patti.broker)}
          </div>
        )}
        {Number(patti.transport) > 0 && (
          <div>Transportation (−): {money(patti.transport)}</div>
        )}
        {(() => {
          const rawNet =
            Number(patti.amount) -
            Number(patti.cd) -
            Number(patti.labor) +
            patti.brSign * Number(patti.broker) -
            Number(patti.transport);
          const ro = Number(patti.net) - rawNet;
          return Math.abs(ro) >= 0.005 ? (
            <div>
              Round Off: {ro < 0 ? "(−) " : ""}
              {money(Math.abs(ro))}
            </div>
          ) : null;
        })()}
        <div className="font-bold text-base pt-1">Net payable: {money(patti.net)}</div>
        {patti.paidMode && (
          <div className="text-xs text-gray-700">
            Paid in {patti.paidMode}
            {patti.paidDate ? ` on ${fmtDate(patti.paidDate)}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
