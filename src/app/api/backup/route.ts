import { requireSession } from "@/lib/auth-helpers";
import { db, schema } from "@/db";
import { getAllBills } from "@/lib/queries";
import { pad2, r2, today } from "@/lib/format";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const url = new URL(req.url);
  const format = url.searchParams.get("format");

  if (format === "csv") {
    const bills = await getAllBills(isOwner);
    const header = [
      "Bill no",
      "Period",
      "Date",
      "Customer",
      "Lot",
      "Bags",
      "Kg",
      "Rate",
      "Amount",
      "Hamali",
      "GST",
      "Total",
      "Paid",
      "Balance",
      ...(isOwner ? ["Profit"] : []),
    ];
    const lines = [header.join(",")];
    for (const b of bills) {
      const row = [
        pad2(b.no),
        b.fy,
        b.date,
        csvEscape(b.customer),
        csvEscape(b.lotName),
        b.bags,
        r2(b.kg),
        r2(b.rate),
        r2(b.amount),
        r2(b.hamali),
        r2(b.gst),
        r2(b.total),
        r2(b.paid),
        r2(b.balance),
        ...(isOwner ? [r2(b.profit ?? 0)] : []),
      ];
      lines.push(row.join(","));
    }
    return new Response(lines.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="bills-${today()}.csv"`,
      },
    });
  }

  // JSON backup
  const [lots, stockIn, bills, payments, expenses, settings, costs] = await Promise.all([
    db.select().from(schema.lots),
    db.select().from(schema.stockIn),
    db.select().from(schema.bills),
    db.select().from(schema.payments),
    db.select().from(schema.expenses),
    db.select().from(schema.settings),
    isOwner ? db.select().from(schema.lotCosts) : Promise.resolve([]),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: session.user.email,
    role: session.user.role,
    lots,
    stockIn,
    bills,
    payments,
    expenses,
    settings,
    ...(isOwner ? { lotCosts: costs } : {}),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="peanut-billing-backup-${today()}.json"`,
    },
  });
}
