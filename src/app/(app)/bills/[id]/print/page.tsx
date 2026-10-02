import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth-helpers";
import { getBillById, getPaymentsByBill, getSettings } from "@/lib/queries";
import { money, pad2 } from "@/lib/format";
import { PrintTrigger } from "./print-trigger";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function PrintBillPage({ params }: Props) {
  const { id } = await params;
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const [bill, pays, settings] = await Promise.all([
    getBillById(id, isOwner),
    getPaymentsByBill(id),
    getSettings(),
  ]);
  if (!bill) notFound();

  return (
    <div className="print:bg-white print:text-black bg-white text-black min-h-screen p-6 mx-auto max-w-3xl">
      <PrintTrigger />
      <style>{`@media print { @page { size: A5; margin: 10mm; } nav, header { display: none !important; } }`}</style>

      <h1 className="text-2xl font-bold mb-1">{settings.firm}</h1>
      <div className="text-sm mb-4">
        Bill no. <b>{pad2(bill.no)}</b> &nbsp;·&nbsp; Period: {bill.fy} &nbsp;·&nbsp; Date: {bill.date}
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
          <tr>
            <td className="py-1">{bill.lotName}</td>
            <td className="text-right py-1">{bill.bags}</td>
            <td className="text-right py-1">{bill.kg}</td>
            <td className="text-right py-1">{money(bill.rate)}</td>
            <td className="text-right py-1">{money(bill.amount)}</td>
          </tr>
        </tbody>
      </table>

      <div className="text-right text-sm space-y-1">
        <div>Hamali: {money(bill.hamali)}</div>
        {bill.gst > 0 && <div>GST: {money(bill.gst)}</div>}
        <div className="font-bold text-base">Total: {money(bill.total)}</div>
        <div>Paid: {money(bill.paid)}</div>
        <div className="font-bold">Balance: {money(bill.balance)}</div>
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
