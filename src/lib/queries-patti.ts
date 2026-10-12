import { and, desc, eq, isNull, sql } from "drizzle-orm";
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
