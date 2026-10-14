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
import { PrintLetterhead } from "@/components/print-letterhead";
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
        letterheadImage={settings.letterheadImage ?? null}
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

      <PrintLetterhead letterheadImage={settings.letterheadImage} firm={settings.firm} />
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
  letterheadImage,
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
  letterheadImage: string | null;
}) {
  if (!bill) return null;
  const totalPaid = pays.reduce((s, p) => s + Number(p.amount), 0);
  const balance = bill.total - totalPaid;
  const totalKg = bill.items.reduce((s, i) => s + i.kg, 0);
  const words = moneyInWords(bill.total);
  const half = tax.pct / 2;
  const totalTax = (tax.cgst ?? 0) + (tax.sgst ?? 0) + (tax.igst ?? 0);
  const taxWords = moneyInWords(totalTax);
  const fmtDate = (d?: string | null) => {
    if (!d) return "";
    const parts = d.split("-");
    if (parts.length !== 3) return d;
    const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${Number(parts[2])}-${MO[Number(parts[1]) - 1]}-${parts[0].slice(2)}`;
  };
  const hsn = bill.items[0]?.hsn ?? "12023090";

  return (
    <div
      className="print:bg-white print:text-black bg-white text-black min-h-screen p-4 mx-auto max-w-5xl gi"
    >
      {chosen ? (
        <>
          <PrintSizeToggle current={size} />
          <PrintTrigger />
        </>
      ) : (
        <PrintSizeChooser recommended="A4" />
      )}
      <style>{`
        @media print { @page { size: ${size} portrait; margin: 8mm } nav, header { display: none !important; } }
        .gi { font: 12px/1.35 Arial, Helvetica, sans-serif; color: #000; }
        .gi table { width: 100%; border-collapse: collapse; }
        .gi > table + table { margin-top: -1px; }
        .gi td, .gi th {
          border: 1px solid #000 !important;
          padding: 2px 5px;
          vertical-align: top;
          color: #000 !important;
          text-align: left;
          font-weight: 400;
        }
        .gi .r { text-align: right !important; }
        .gi .c { text-align: center !important; }
        .gi .b { font-weight: 700; }
        .gi .i { font-style: italic; }
        .gi .np { padding: 0 !important; }
        .gi .bt { border-top: 1px solid #000; padding: 3px 5px; }
        .gi .nb { border: 0 !important; }
      `}</style>

      {letterheadImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={letterheadImage}
          alt={seller.name ?? "Firm letterhead"}
          className="mb-2 w-full max-h-32 object-contain"
        />
      )}
      <div className="text-center font-bold text-base mb-2">Tax Invoice</div>

      {/* Top block: seller + consignee + buyer on the left, header grid on the right. */}
      <table>
        <tbody>
          <tr>
            <td className="np" style={{ width: "50%" }}>
              <div style={{ padding: "3px 5px" }}>
                <b style={{ fontSize: 13 }}>{seller.name ?? ""}</b>
                {seller.address && (
                  <>
                    <br />
                    <span className="whitespace-pre-line">{seller.address}</span>
                  </>
                )}
                {seller.fssai && (
                  <>
                    <br />
                    FSSAI No. : {seller.fssai}
                  </>
                )}
                <br />
                GSTIN/UIN: {seller.gstin ?? ""}
                <br />
                State Name : {seller.state ?? ""}
                {seller.stateCode ? `, Code : ${seller.stateCode}` : ""}
                {seller.email && (
                  <>
                    <br />
                    E-Mail : {seller.email}
                  </>
                )}
              </div>
              <div className="bt">
                Consignee (Ship to)
                <br />
                <b>{consignee.name}</b>
                {consignee.address && (
                  <>
                    <br />
                    <span className="whitespace-pre-line">{consignee.address}</span>
                  </>
                )}
                <br />
                GSTIN/UIN : {consignee.gstin ?? ""}
                <br />
                State Name : {consignee.state ?? ""}
                {consignee.stateCode ? `, Code : ${consignee.stateCode}` : ""}
              </div>
              <div className="bt">
                Buyer (Bill to)
                <br />
                <b>{buyer.name}</b>
                {buyer.address && (
                  <>
                    <br />
                    <span className="whitespace-pre-line">{buyer.address}</span>
                  </>
                )}
                <br />
                GSTIN/UIN : {buyer.gstin ?? ""}
                <br />
                State Name : {buyer.state ?? ""}
                {buyer.stateCode ? `, Code : ${buyer.stateCode}` : ""}
              </div>
            </td>
            <td className="np">
              <table>
                <tbody>
                  <tr>
                    <td colSpan={2}>
                      Invoice No.<br />
                      <b>{pad2(bill.no)}</b>
                    </td>
                    <td colSpan={2}>
                      e-Way Bill No.<br />
                      <b>{header.ewb ?? ""}</b>
                    </td>
                    <td colSpan={2}>
                      Dated<br />
                      <b>{fmtDate(bill.date)}</b>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3}>
                      Delivery Note<br />
                      <b>{header.dn ?? ""}</b>
                    </td>
                    <td colSpan={3}>
                      Mode/Terms of Payment<br />
                      <b>{header.mp ?? ""}</b>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3}>
                      Reference No. &amp; Date.<br />
                      <b>{header.rf ?? ""}</b>
                    </td>
                    <td colSpan={3}>
                      Other References<br />
                      <b>{header.or ?? ""}</b>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3}>
                      Buyer&apos;s Order No.<br />
                      <b>{header.bo ?? ""}</b>
                    </td>
                    <td colSpan={3}>
                      Dated<br />
                      <b>{fmtDate(header.bd)}</b>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3}>
                      Dispatch Doc No.<br />
                      <b>{header.dd ?? ""}</b>
                    </td>
                    <td colSpan={3}>
                      Delivery Note Date<br />
                      <b>{fmtDate(header.dt)}</b>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3}>
                      Dispatched through<br />
                      <b>{header.through ?? ""}</b>
                    </td>
                    <td colSpan={3}>
                      Destination<br />
                      <b>{header.destination ?? ""}</b>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3}>
                      Bill of Lading/LR-RR No.<br />
                      <b>{header.lr ?? ""}</b>
                    </td>
                    <td colSpan={3}>
                      Motor Vehicle No.<br />
                      <b>{header.veh ?? ""}</b>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={6} style={{ height: 60 }}>
                      Terms of Delivery<br />
                      <b>{header.td ?? ""}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Items table — 7 columns matching the inspiration layout. */}
      <table>
        <thead>
          <tr>
            <th className="c" style={{ width: "4%" }}>Sl No.</th>
            <th>Description of Goods</th>
            <th style={{ width: "13%" }}>HSN/SAC</th>
            <th className="r" style={{ width: "15%" }}>Quantity</th>
            <th className="r" style={{ width: "11%" }}>Rate</th>
            <th style={{ width: "6%" }}>per</th>
            <th className="r" style={{ width: "16%" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((it, idx) => (
            <tr key={it.id}>
              <td className="r">{idx + 1}</td>
              <td>
                <b>{it.description ?? it.lotName ?? "Ground Nuts"}</b>
              </td>
              <td>{it.hsn ?? hsn}</td>
              <td className="r">
                <b>{r2(it.kg)} kgs</b>
                <br />
                <i>({it.bags} Bag)</i>
              </td>
              <td className="r">{money(it.rate)}</td>
              <td>kgs</td>
              <td className="r b">{money(it.amount)}</td>
            </tr>
          ))}
          {tax.intra ? (
            <>
              <tr>
                <td></td>
                <td className="r b"><i>CGST</i></td>
                <td></td>
                <td></td>
                <td className="r"><i>{half.toFixed(2)}</i></td>
                <td>%</td>
                <td className="r b">{money(tax.cgst ?? 0)}</td>
              </tr>
              <tr>
                <td></td>
                <td className="r b"><i>SGST</i></td>
                <td></td>
                <td></td>
                <td className="r"><i>{half.toFixed(2)}</i></td>
                <td>%</td>
                <td className="r b">{money(tax.sgst ?? 0)}</td>
              </tr>
            </>
          ) : (
            <tr>
              <td></td>
              <td className="r b"><i>IGST</i></td>
              <td></td>
              <td></td>
              <td className="r"><i>{tax.pct.toFixed(2)}</i></td>
              <td>%</td>
              <td className="r b">{money(tax.igst ?? 0)}</td>
            </tr>
          )}
          {Math.abs(tax.roundOff) > 0.005 && (
            <tr>
              <td></td>
              <td className="r b"><i>Round Off</i></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td className="r b">
                {tax.roundOff < 0 ? "(-)" : ""}
                {money(Math.abs(tax.roundOff))}
              </td>
            </tr>
          )}
          <tr style={{ height: 40 }}>
            <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
          </tr>
          <tr>
            <td></td>
            <td className="r">Total</td>
            <td></td>
            <td className="r b">{r2(totalKg)} kgs</td>
            <td></td>
            <td></td>
            <td className="r b" style={{ fontSize: 14 }}>₹ {money(bill.total)}</td>
          </tr>
        </tbody>
      </table>

      {/* Amount in words — full-width single row. */}
      <table>
        <tbody>
          <tr>
            <td>
              Amount Chargeable (in words)
              <span style={{ float: "right" }}><i>E. &amp; O.E</i></span>
              <br />
              <b style={{ fontSize: 13 }}>{words}</b>
            </td>
          </tr>
        </tbody>
      </table>

      {/* HSN tax summary table with rowspan/colspan headers matching inspiration. */}
      <table>
        <thead>
          <tr>
            <th rowSpan={2}>HSN/SAC</th>
            <th className="r" rowSpan={2}>Taxable Value</th>
            {tax.intra ? (
              <>
                <th className="c" colSpan={2}>CGST</th>
                <th className="c" colSpan={2}>SGST/UTGST</th>
              </>
            ) : (
              <th className="c" colSpan={2}>IGST</th>
            )}
            <th className="r" rowSpan={2}>Total Tax Amount</th>
          </tr>
          <tr>
            {tax.intra ? (
              <>
                <th className="r">Rate</th>
                <th className="r">Amount</th>
                <th className="r">Rate</th>
                <th className="r">Amount</th>
              </>
            ) : (
              <>
                <th className="r">Rate</th>
                <th className="r">Amount</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{hsn}</td>
            <td className="r">{money(tax.taxable)}</td>
            {tax.intra ? (
              <>
                <td className="r">{half.toFixed(2)}%</td>
                <td className="r">{money(tax.cgst ?? 0)}</td>
                <td className="r">{half.toFixed(2)}%</td>
                <td className="r">{money(tax.sgst ?? 0)}</td>
              </>
            ) : (
              <>
                <td className="r">{tax.pct.toFixed(2)}%</td>
                <td className="r">{money(tax.igst ?? 0)}</td>
              </>
            )}
            <td className="r">{money(totalTax)}</td>
          </tr>
          <tr>
            <td className="r b">Total</td>
            <td className="r b">{money(tax.taxable)}</td>
            {tax.intra ? (
              <>
                <td></td>
                <td className="r b">{money(tax.cgst ?? 0)}</td>
                <td></td>
                <td className="r b">{money(tax.sgst ?? 0)}</td>
              </>
            ) : (
              <>
                <td></td>
                <td className="r b">{money(tax.igst ?? 0)}</td>
              </>
            )}
            <td className="r b">{money(totalTax)}</td>
          </tr>
        </tbody>
      </table>

      {/* Tax amount in words. */}
      <table>
        <tbody>
          <tr>
            <td>
              Tax Amount (in words) : <b>{taxWords}</b>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Declaration (left) + Company's Bank Details with signatory (right). */}
      <table>
        <tbody>
          <tr>
            <td style={{ width: "50%", height: 80, verticalAlign: "bottom" }}>
              <u>Declaration</u>
              <br />
              <span className="whitespace-pre-line">{seller.declaration ?? ""}</span>
            </td>
            <td>
              Company&apos;s Bank Details
              <br />
              A/c Holder&apos;s Name : {seller.bankHolder ?? ""}
              <br />
              Bank Name : {seller.bankName ?? ""}
              <br />
              A/c No. : {seller.bankAccount ?? ""}
              <br />
              Branch &amp; IFS Code : {seller.bankIfsc ?? ""}
              <div className="r b" style={{ marginTop: 8 }}>
                for {seller.name ?? "the firm"}
              </div>
              <div className="r" style={{ marginTop: 18 }}>Authorised Signatory</div>
            </td>
          </tr>
        </tbody>
      </table>

      {balance > 0.5 && (
        <div className="text-right text-xs mt-1">
          Paid: {money(totalPaid)} · <b>Balance: {money(balance)}</b>
        </div>
      )}

      <div className="text-center mt-2" style={{ fontSize: 11 }}>
        This is a Computer Generated Invoice
      </div>
    </div>
  );
}
