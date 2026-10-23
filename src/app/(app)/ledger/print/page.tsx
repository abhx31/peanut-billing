import {
  cashBalanceBefore,
  getAllPaymentsOnDate,
  getBillsByDate,
  getCashDepositsOnDate,
  getExpensesByDate,
  getSettings,
} from "@/lib/queries";
import { requireSession } from "@/lib/auth-helpers";
import { fmtDate, money, pad2, r2, today } from "@/lib/format";
import { PrintTrigger } from "../../bills/[id]/print/print-trigger";
import { PrintSizeChooser, PrintSizeToggle } from "@/components/print-size-toggle";
import { PrintLetterhead } from "@/components/print-letterhead";
import { LedgerTAccount } from "@/components/ledger-t-account";
import { hasPageSize, parsePageSize } from "@/lib/print-size";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ d?: string; size?: string }> };

export default async function PrintLedgerPage({ searchParams }: Props) {
  const sp = await searchParams;
  const date = sp.d || today();
  const size = parsePageSize(sp.size, "A4");
  const chosen = hasPageSize(sp.size);
  const session = await requireSession();
  const isOwner = session.user.role === "owner";

  const [bills, pays, expenses, settings, openCash, openBank, depositsToday] = await Promise.all([
    getBillsByDate(date, isOwner),
    getAllPaymentsOnDate(date),
    getExpensesByDate(date),
    getSettings(),
    cashBalanceBefore("Cash", date),
    cashBalanceBefore("UPI", date),
    getCashDepositsOnDate(date),
  ]);

  const cashIn = pays.filter((p) => p.mode === "Cash").reduce((s, p) => s + Number(p.amount), 0);
  const upiIn = pays.filter((p) => p.mode === "UPI").reduce((s, p) => s + Number(p.amount), 0);
  const cashOut = expenses
    .filter((e) => e.mode === "Cash")
    .reduce((s, e) => s + Number(e.amount), 0);
  const upiOut = expenses
    .filter((e) => e.mode === "UPI")
    .reduce((s, e) => s + Number(e.amount), 0);
  const depositTotal = depositsToday.reduce((s, d) => s + Number(d.amount), 0);
  const sales = bills.reduce((s, b) => s + b.total, 0);
  const credit = bills.reduce((s, b) => s + b.balance, 0);
  const profit = isOwner ? bills.reduce((s, b) => s + (b.profit ?? 0), 0) : 0;

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
      <div className="mb-4">Daily ledger — {fmtDate(date)}</div>

      <div className="mb-4">
        <h2 className="font-semibold mb-1">Cash in hand</h2>
        <LedgerTAccount
          debits={[
            { label: "To Opening balance b/d", amount: openCash },
            { label: "To Cash received", amount: cashIn },
          ]}
          credits={[
            { label: "By Cash expenses", amount: cashOut },
            { label: "By Deposited to bank", amount: depositTotal },
            {
              label: "By Closing balance c/d",
              amount: openCash + cashIn - cashOut - depositTotal,
            },
          ]}
        />
      </div>

      <div className="mb-4">
        <h2 className="font-semibold mb-1">Bank / UPI</h2>
        <LedgerTAccount
          debits={[
            { label: "To Opening balance b/d", amount: openBank },
            { label: "To UPI received", amount: upiIn },
            { label: "To Cash deposited", amount: depositTotal },
          ]}
          credits={[
            { label: "By UPI expenses", amount: upiOut },
            {
              label: "By Closing balance c/d",
              amount: openBank + upiIn - upiOut + depositTotal,
            },
          ]}
        />
      </div>

      <Section title="Day result">
        <Row label="Sales (total)" value={money(sales)} />
        <Row label="Balance given (credit)" value={money(credit)} />
        {isOwner && <Row label="Profit on bills" value={money(profit)} />}
        <Row label="Expenses" value={money(cashOut + upiOut)} />
        {isOwner && (
          <Row label="Profit after expenses" value={money(profit - cashOut - upiOut)} strong />
        )}
      </Section>

      {bills.length > 0 && (
        <>
          <h2 className="font-semibold mt-6 mb-2">Sales</h2>
          <table className="w-full border-collapse mb-4">
            <thead>
              <tr>
                {["#", "Customer", "Lot", "Bags", "Kg", "Total", "Paid", "Balance"].map((h) => (
                  <th key={h} className="text-left border-b border-gray-500 py-1 text-xs">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td className="py-1 font-mono">{pad2(b.no)}</td>
                  <td className="py-1">{b.customer}</td>
                  <td className="py-1">{b.lotSummary}</td>
                  <td className="py-1 text-right">{b.bags}</td>
                  <td className="py-1 text-right">{r2(b.kg)}</td>
                  <td className="py-1 text-right">{money(b.total)}</td>
                  <td className="py-1 text-right">{money(b.paid)}</td>
                  <td className="py-1 text-right">{money(b.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {expenses.length > 0 && (
        <>
          <h2 className="font-semibold mt-6 mb-2">Expenses</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Category", "Note", "Paid by", "Amount"].map((h) => (
                  <th key={h} className="text-left border-b border-gray-500 py-1 text-xs">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="py-1">{e.category}</td>
                  <td className="py-1">{e.note ?? ""}</td>
                  <td className="py-1">{e.mode}</td>
                  <td className="py-1 text-right">{money(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="font-semibold mb-1">{title}</h2>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
