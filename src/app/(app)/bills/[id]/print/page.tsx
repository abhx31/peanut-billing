import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { getBillById, getPaymentsByBill, getSettings } from "@/lib/queries";
import { db, schema } from "@/db";
import { money, pad2, r2 } from "@/lib/format";
import { moneyInWords } from "@/lib/words";
import { PrintTrigger } from "./print-trigger";
import {
  PrintSizeChooser,
  PrintSizeToggle,
} from "@/components/print-size-toggle";
import { hasPageSize, parsePageSize, type PageSize } from "@/lib/print-size";
import type {
  GstHeaderExtras,
  GstProfile,
  GstTaxBreakdown,
  PartySnapshot,
} from "@/lib/gst-types";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ size?: string }>;
};

export default async function PrintBillPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const [bill, pays, settings] = await Promise.all([
    getBillById(id, isOwner),
    getPaymentsByBill(id),
    getSettings(),
  ]);
  if (!bill) notFound();

  if ((bill as { kind?: string }).kind === "gst") {
    const raw = await db.query.bills.findFirst({
      where: eq(schema.bills.id, id),
    });
    const size = parsePageSize(sp.size, "A4");
    const chosen = hasPageSize(sp.size);
    return (
      <GstInvoicePrint
        size={size}
        chosen={chosen}
        bill={bill}
        pays={pays}
        buyer={(raw?.buyerSnapshot ?? {}) as PartySnapshot}
        consignee={(raw?.consigneeSnapshot ?? {}) as PartySnapshot}
        seller={(raw?.sellerSnapshot ?? {}) as GstProfile}
        header={(raw?.headerExtras ?? {}) as GstHeaderExtras}
        tax={(raw?.taxBreakdown ?? {}) as GstTaxBreakdown}
      />
    );
  }

  const size = parsePageSize(sp.size, "A5");
  const chosen = hasPageSize(sp.size);
  const multiLine = bill.items.length > 1;
  const linesWithWeights = bill.items.filter((it) => it.weightsText);

  return (
    <div className="print:bg-white print:text-black bg-white text-black min-h-screen p-6 mx-auto max-w-3xl">
      {chosen ? (
        <>
          <PrintSizeToggle current={size} />
          <PrintTrigger />
        </>
      ) : (
        <PrintSizeChooser recommended="A5" />
      )}
      <style>{`@media print { @page { size: ${size}; margin: 10mm; } nav, header { display: none !important; } }`}</style>

      <h1 className="text-2xl font-bold mb-1">{settings.firm}</h1>
      <div className="text-sm mb-4">
        Bill no. <b>{pad2(bill.no)}</b> &nbsp;·&nbsp; Period: {bill.fy} &nbsp;·&nbsp; Date:{" "}
        {bill.date}
        <br />
        Customer: <b>{bill.customer}</b>
      </div>

      <table className="w-full text-sm border-collapse mb-3">
        <thead>
          <tr>
            <th className="text-left border-b border-gray-500 py-1">Lot / quality</th>
            <th className="text-right border-b border-gray-500 py-1">Bags</th>
            <th className="text-right border-b border-gray-500 py-1">Weight (kg)</th>
            <th className="text-right border-b border-gray-500 py-1">Price/kg</th>
            <th className="text-right border-b border-gray-500 py-1">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((it) => (
            <tr key={it.id}>
              <td className="py-1">{it.lotName}</td>
              <td className="text-right py-1">{it.bags}</td>
              <td className="text-right py-1">{r2(it.kg)}</td>
              <td className="text-right py-1">{money(it.rate)}</td>
              <td className="text-right py-1">{money(it.amount)}</td>
            </tr>
          ))}
          {multiLine && (
            <tr className="font-semibold">
              <td className="py-1 border-t border-gray-500">Total</td>
              <td className="text-right py-1 border-t border-gray-500">{bill.bags}</td>
              <td className="text-right py-1 border-t border-gray-500">{r2(bill.kg)}</td>
              <td className="border-t border-gray-500" />
              <td className="text-right py-1 border-t border-gray-500">
                {money(bill.amount)}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {linesWithWeights.length > 0 && (
        <p className="text-xs mb-3">
          <span className="font-semibold">Bag weights (kg):</span>
          <br />
          {linesWithWeights.map((it) => (
            <span key={it.id}>
              {it.lotName}: {it.weightsText}
              <br />
            </span>
          ))}
        </p>
      )}

      <div className="text-right text-sm space-y-1">
        <div>Hamali: {money(bill.hamali)}</div>
        {bill.gst > 0 && (
          <div>
            GST {bill.gstPercent}%: {money(bill.gst)}
          </div>
        )}
        <div className="font-bold text-base">Total: {money(bill.total)}</div>
        {bill.paidNow != null && (
          <div>Paid now: {money(bill.paidNow)}</div>
        )}
        {bill.prev != null && bill.prev > 0.005 && (
          <div>Previous balance: {money(bill.prev)}</div>
        )}
        {bill.prev != null && bill.prev > 0.005 ? (
          <div className="font-bold">
            Total balance due: {money(bill.prev + bill.balance)}
          </div>
        ) : (
          <>
            <div>Paid: {money(bill.paid)}</div>
            <div className="font-bold">Balance: {money(bill.balance)}</div>
          </>
        )}
      </div>

      {pays.length > 0 && (
        <div className="mt-6 text-xs">
          <div className="font-semibold mb-1">Payments received</div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left border-b border-gray-400 py-1">Date</th>
                <th className="text-left border-b border-gray-400 py-1">Mode</th>
                <th className="text-right border-b border-gray-400 py-1">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id}>
                  <td className="py-1">{p.date}</td>
                  <td className="py-1">{p.mode}</td>
                  <td className="text-right py-1">{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GstInvoicePrint({
  size,
  chosen,
  bill,
  pays,
  buyer,
  consignee,
  seller,
  header,
  tax,
}: {
  size: PageSize;
  chosen: boolean;
  bill: Awaited<ReturnType<typeof getBillById>>;
  pays: Awaited<ReturnType<typeof getPaymentsByBill>>;
  buyer: PartySnapshot;
  consignee: PartySnapshot;
  seller: GstProfile;
  header: GstHeaderExtras;
  tax: GstTaxBreakdown;
}) {
  if (!bill) return null;
  const totalPaid = pays.reduce((s, p) => s + Number(p.amount), 0);
  const balance = bill.total - totalPaid;
  const totalBags = bill.items.reduce((s, i) => s + i.bags, 0);
  const totalKg = bill.items.reduce((s, i) => s + i.kg, 0);
  const words = moneyInWords(bill.total);
  const fontPx = size === "A5" ? 10 : 12;

  return (
    <div
      className="print:bg-white print:text-black bg-white text-black min-h-screen p-4 mx-auto max-w-5xl"
      style={{ fontSize: `${fontPx}px` }}
    >
      {chosen ? (
        <>
          <PrintSizeToggle current={size} />
          <PrintTrigger />
        </>
      ) : (
        <PrintSizeChooser recommended="A4" />
      )}
      <style>{`@media print { @page { size: ${size} portrait; margin: 8mm } nav, header { display: none !important; } }
      table.gs, table.gs td, table.gs th { border: 1px solid #000; border-collapse: collapse; }
      table.gs th, table.gs td { padding: 3px 6px; vertical-align: top; }
      `}</style>

      <div className="text-center font-semibold">TAX INVOICE</div>
      <table className="gs w-full mt-1">
        <tbody>
          <tr>
            <td className="w-1/2">
              <div className="font-semibold text-sm">{seller.name ?? ""}</div>
              <div className="whitespace-pre-line">{seller.address ?? ""}</div>
              <div>GSTIN/UIN: {seller.gstin ?? ""}</div>
              <div>
                State Name: {seller.state ?? ""}
                {seller.stateCode ? `, Code: ${seller.stateCode}` : ""}
              </div>
              {seller.fssai && <div>FSSAI: {seller.fssai}</div>}
              {seller.email && <div>E-Mail: {seller.email}</div>}
            </td>
            <td className="w-1/2 p-0">
              <table className="w-full">
                <tbody>
                  <tr>
                    <td className="border-b border-black">
                      <b>Invoice No.</b>
                      <br />
                      {pad2(bill.no)}
                    </td>
                    <td className="border-b border-l border-black">
                      <b>Dated</b>
                      <br />
                      {bill.date}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-black">
                      <b>Delivery Note</b>
                      <br />
                      {header.dn ?? ""}
                    </td>
                    <td className="border-b border-l border-black">
                      <b>Mode/Terms of Payment</b>
                      <br />
                      {header.mp ?? ""}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-black">
                      <b>Reference No. &amp; Date</b>
                      <br />
                      {header.rf ?? ""}
                    </td>
                    <td className="border-b border-l border-black">
                      <b>Other References</b>
                      <br />
                      {header.or ?? ""}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-black">
                      <b>Buyer&apos;s Order No.</b>
                      <br />
                      {header.bo ?? ""}
                    </td>
                    <td className="border-b border-l border-black">
                      <b>Dated</b>
                      <br />
                      {header.bd ?? ""}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-black">
                      <b>Dispatch Doc No.</b>
                      <br />
                      {header.dd ?? ""}
                    </td>
                    <td className="border-b border-l border-black">
                      <b>Delivery Note Date</b>
                      <br />
                      {header.dt ?? ""}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-black">
                      <b>Dispatched through</b>
                      <br />
                      {header.through ?? ""}
                    </td>
                    <td className="border-b border-l border-black">
                      <b>Destination</b>
                      <br />
                      {header.destination ?? ""}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2}>
                      <b>Vehicle no:</b> {header.veh ?? ""}
                      {header.ewb ? ` · e-Way Bill: ${header.ewb}` : ""}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td>
              <div className="font-semibold">Consignee (Ship to)</div>
              <div className="font-semibold">{consignee.name}</div>
              <div className="whitespace-pre-line">{consignee.address ?? ""}</div>
              {consignee.gstin && <div>GSTIN/UIN: {consignee.gstin}</div>}
              <div>
                State Name: {consignee.state ?? ""}
                {consignee.stateCode ? `, Code: ${consignee.stateCode}` : ""}
              </div>
            </td>
            <td>
              <div className="font-semibold">Buyer (Bill to)</div>
              <div className="font-semibold">{buyer.name}</div>
              <div className="whitespace-pre-line">{buyer.address ?? ""}</div>
              {buyer.gstin && <div>GSTIN/UIN: {buyer.gstin}</div>}
              <div>
                State Name: {buyer.state ?? ""}
                {buyer.stateCode ? `, Code: ${buyer.stateCode}` : ""}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="gs w-full mt-2">
        <thead>
          <tr>
            <th className="w-8">Sl</th>
            <th>Description of Goods</th>
            <th>HSN/SAC</th>
            <th className="text-right">Bags</th>
            <th className="text-right">Weight (kg)</th>
            <th className="text-right">Rate (per kg)</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((it, idx) => (
            <tr key={it.id}>
              <td className="text-center">{idx + 1}</td>
              <td>
                <b>{it.description ?? "Ground Nuts"}</b>
                <br />
                <span className="text-[11px]">Lot: {it.lotName}</span>
              </td>
              <td className="font-mono">{it.hsn ?? "12023090"}</td>
              <td className="text-right">{it.bags}</td>
              <td className="text-right">{r2(it.kg)}</td>
              <td className="text-right">{money(it.rate)}</td>
              <td className="text-right">{money(it.amount)}</td>
            </tr>
          ))}
          {tax.intra ? (
            <>
              <tr>
                <td colSpan={6} className="text-right font-semibold">
                  Output CGST @ {(tax.pct / 2).toFixed(2)}%
                </td>
                <td className="text-right">{money(tax.cgst ?? 0)}</td>
              </tr>
              <tr>
                <td colSpan={6} className="text-right font-semibold">
                  Output SGST @ {(tax.pct / 2).toFixed(2)}%
                </td>
                <td className="text-right">{money(tax.sgst ?? 0)}</td>
              </tr>
            </>
          ) : (
            <tr>
              <td colSpan={6} className="text-right font-semibold">
                Output IGST @ {tax.pct.toFixed(2)}%
              </td>
              <td className="text-right">{money(tax.igst ?? 0)}</td>
            </tr>
          )}
          {Math.abs(tax.roundOff) > 0.005 && (
            <tr>
              <td colSpan={6} className="text-right">
                Round Off
              </td>
              <td className="text-right">{money(tax.roundOff)}</td>
            </tr>
          )}
          <tr className="font-bold">
            <td colSpan={3} className="text-right">
              Total
            </td>
            <td className="text-right">{totalBags}</td>
            <td className="text-right">{r2(totalKg)}</td>
            <td />
            <td className="text-right">{money(bill.total)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-2">
        <b>Amount Chargeable (in words): </b>
        {words} E. &amp; O.E
      </div>

      <table className="gs w-full mt-2">
        <thead>
          <tr>
            <th>HSN/SAC</th>
            <th className="text-right">Taxable Value</th>
            <th className="text-right">
              {tax.intra ? "Central Tax" : "Integrated Tax"}
            </th>
            {tax.intra && <th className="text-right">State Tax</th>}
            <th className="text-right">Total Tax Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="font-mono">{bill.items[0]?.hsn ?? "12023090"}</td>
            <td className="text-right">{money(tax.taxable)}</td>
            {tax.intra ? (
              <>
                <td className="text-right">{money(tax.cgst ?? 0)}</td>
                <td className="text-right">{money(tax.sgst ?? 0)}</td>
              </>
            ) : (
              <td className="text-right">{money(tax.igst ?? 0)}</td>
            )}
            <td className="text-right">
              {money((tax.cgst ?? 0) + (tax.sgst ?? 0) + (tax.igst ?? 0))}
            </td>
          </tr>
          <tr className="font-bold">
            <td className="text-right">Total</td>
            <td className="text-right">{money(tax.taxable)}</td>
            {tax.intra ? (
              <>
                <td className="text-right">{money(tax.cgst ?? 0)}</td>
                <td className="text-right">{money(tax.sgst ?? 0)}</td>
              </>
            ) : (
              <td className="text-right">{money(tax.igst ?? 0)}</td>
            )}
            <td className="text-right">
              {money((tax.cgst ?? 0) + (tax.sgst ?? 0) + (tax.igst ?? 0))}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-1">
        <b>Tax Amount (in words): </b>
        {moneyInWords((tax.cgst ?? 0) + (tax.sgst ?? 0) + (tax.igst ?? 0))}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="border border-black p-2">
          {seller.declaration && (
            <>
              <div className="font-semibold">Declaration</div>
              <div className="whitespace-pre-line">{seller.declaration}</div>
            </>
          )}
          {(seller.bankHolder || seller.bankName || seller.bankAccount || seller.bankIfsc) && (
            <>
              <div className="font-semibold mt-2">Company&apos;s Bank Details</div>
              {seller.bankHolder && <div>A/c Holder&apos;s Name: {seller.bankHolder}</div>}
              {seller.bankName && <div>Bank Name: {seller.bankName}</div>}
              {seller.bankAccount && <div>A/c No.: {seller.bankAccount}</div>}
              {seller.bankIfsc && <div>Branch &amp; IFS Code: {seller.bankIfsc}</div>}
            </>
          )}
        </div>
        <div className="border border-black p-2 text-right">
          <div className="font-semibold">for {seller.name ?? "the firm"}</div>
          <div className="mt-16">Authorised Signatory</div>
        </div>
      </div>

      {balance > 0.5 && (
        <div className="mt-2 text-right text-xs">
          Paid: {money(totalPaid)} · <b>Balance: {money(balance)}</b>
        </div>
      )}

      <div className="text-center text-[10px] mt-2">
        This is a Computer Generated Invoice
      </div>
    </div>
  );
}
