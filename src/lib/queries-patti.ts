import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** Regular purchase patti bills (kind is null) on a date. */
export async function getPattiBillsByDate(date: string) {
  return db
    .select()
    .from(schema.pattiBills)
    .where(
      and(eq(schema.pattiBills.date, date), isNull(schema.pattiBills.kind)),
    )
    .orderBy(desc(schema.pattiBills.createdAt));
}

export async function getPattiLotNameSuggestions() {
  const rows = await db
    .selectDistinct({ lotName: schema.pattiBills.lotName })
    .from(schema.pattiBills)
    .where(isNull(schema.pattiBills.kind));
  return rows
    .map((r) => r.lotName)
    .filter((x): x is string => !!x)
    .sort();
}

/** GST purchase bills (kind = 'gstp') whose supplier-invoice date falls in a
 *  given year-month ("YYYY-MM"). */
export async function getGstPurchasesForMonth(ym: string) {
  return db
    .select()
    .from(schema.pattiBills)
    .where(
      and(
        eq(schema.pattiBills.kind, "gstp"),
        sql`to_char(coalesce(${schema.pattiBills.invDate}, ${schema.pattiBills.date}), 'YYYY-MM') = ${ym}`,
      ),
    )
    .orderBy(desc(schema.pattiBills.createdAt));
}

/** Output tax (GST sales invoices) + ITC (GST purchases) for a month,
 *  grouped by CGST/SGST/IGST — the Phase-D "GST summary" tile row. */
export async function getGstMonthlySummary(ym: string) {
  const sales = await db
    .select({
      taxable: schema.bills.amount,
      tax: schema.bills.taxBreakdown,
    })
    .from(schema.bills)
    .where(
      and(
        eq(schema.bills.kind, "gst"),
        sql`to_char(${schema.bills.date}, 'YYYY-MM') = ${ym}`,
      ),
    );
  const purchases = await db
    .select({
      taxable: schema.pattiBills.taxable,
      tax: schema.pattiBills.tax,
      itc: schema.pattiBills.itc,
    })
    .from(schema.pattiBills)
    .where(
      and(
        eq(schema.pattiBills.kind, "gstp"),
        sql`to_char(coalesce(${schema.pattiBills.invDate}, ${schema.pattiBills.date}), 'YYYY-MM') = ${ym}`,
      ),
    );

  type Breakdown = {
    cgst?: number;
    sgst?: number;
    igst?: number;
    intra?: boolean;
  };
  const outputTaxable = sales.reduce((s, r) => s + Number(r.taxable ?? 0), 0);
  const output = sales.reduce(
    (acc, r) => {
      const t = (r.tax ?? {}) as Breakdown;
      acc.cgst += Number(t.cgst ?? 0);
      acc.sgst += Number(t.sgst ?? 0);
      acc.igst += Number(t.igst ?? 0);
      return acc;
    },
    { cgst: 0, sgst: 0, igst: 0 },
  );
  const inputTaxable = purchases.reduce(
    (s, r) => s + Number(r.taxable ?? 0),
    0,
  );
  const itc = purchases.reduce(
    (acc, r) => {
      // Only count tax when ITC is claimable (itc field is non-null and > 0).
      const claim = Number(r.itc ?? 0);
      if (claim <= 0) return acc;
      const t = (r.tax ?? {}) as Breakdown;
      acc.cgst += Number(t.cgst ?? 0);
      acc.sgst += Number(t.sgst ?? 0);
      acc.igst += Number(t.igst ?? 0);
      return acc;
    },
    { cgst: 0, sgst: 0, igst: 0 },
  );
  return {
    outputTaxable,
    output,
    inputTaxable,
    itc,
    netPayable: {
      cgst: output.cgst - itc.cgst,
      sgst: output.sgst - itc.sgst,
      igst: output.igst - itc.igst,
    },
  };
}

/** Sum of patti_payments per purchase bill (regular Patti or GST Purchase). */
export async function getPattiPaidMap(
  pattiIds: string[],
): Promise<Map<string, number>> {
  if (pattiIds.length === 0) return new Map();
  const rows = await db
    .select({
      pattiId: schema.pattiPayments.pattiId,
      paid: sql<string>`coalesce(sum(${schema.pattiPayments.amount}), 0)`,
    })
    .from(schema.pattiPayments)
    .where(inArray(schema.pattiPayments.pattiId, pattiIds))
    .groupBy(schema.pattiPayments.pattiId);
  return new Map(rows.map((r) => [r.pattiId, Number(r.paid)]));
}

/** Every purchase bill (regular Patti or GST Purchase) with an outstanding
 *  balance — net minus whatever's been paid so far. For the Payments
 *  recorded tab's "still owed" summary. */
export async function getOutstandingPattiBills() {
  const bills = await db
    .select({
      id: schema.pattiBills.id,
      kind: schema.pattiBills.kind,
      no: schema.pattiBills.no,
      fy: schema.pattiBills.fy,
      date: schema.pattiBills.date,
      party: schema.pattiBills.party,
      net: schema.pattiBills.net,
    })
    .from(schema.pattiBills)
    .orderBy(asc(schema.pattiBills.date), asc(schema.pattiBills.no));
  const paidMap = await getPattiPaidMap(bills.map((b) => b.id));
  return bills
    .map((b) => {
      const paid = paidMap.get(b.id) ?? 0;
      const net = Number(b.net);
      return { ...b, net, paid, balance: net - paid };
    })
    .filter((b) => b.balance > 0.5);
}

/** Every payment recorded against any purchase bill, newest first — the
 *  Payments recorded tab's main list. */
export async function getAllPattiPayments() {
  return db
    .select({
      id: schema.pattiPayments.id,
      date: schema.pattiPayments.date,
      mode: schema.pattiPayments.mode,
      amount: schema.pattiPayments.amount,
      note: schema.pattiPayments.note,
      pattiId: schema.pattiPayments.pattiId,
      pattiNo: schema.pattiBills.no,
      pattiKind: schema.pattiBills.kind,
      party: schema.pattiBills.party,
      net: schema.pattiBills.net,
    })
    .from(schema.pattiPayments)
    .innerJoin(schema.pattiBills, eq(schema.pattiBills.id, schema.pattiPayments.pattiId))
    .orderBy(desc(schema.pattiPayments.date), desc(schema.pattiPayments.createdAt));
}
