import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { atLoc, type Loc } from "@/lib/loc";

export async function getHamaliForDate(date: string, loc: Loc) {
  const bs = await db
    .select({
      id: schema.bills.id,
      no: schema.bills.no,
      kind: schema.bills.kind,
      loc: schema.bills.loc,
      customer: schema.bills.customer,
      bags: sql<number>`coalesce(sum(${schema.billItems.bags}), 0)::int`,
      hamali: schema.bills.hamali,
      hamaliPerBag: schema.bills.hamaliPerBag,
    })
    .from(schema.bills)
    .leftJoin(schema.billItems, eq(schema.billItems.billId, schema.bills.id))
    .where(
      and(
        eq(schema.bills.date, date),
        sql`${schema.bills.hamali}::numeric > 0`,
        atLoc(schema.bills.loc, loc),
      ),
    )
    .groupBy(schema.bills.id)
    .orderBy(schema.bills.no);
  const totalBags = bs.reduce((s, b) => s + Number(b.bags), 0);
  const totalAmount = bs.reduce((s, b) => s + Number(b.hamali), 0);
  return { bills: bs, totalBags, totalAmount };
}

// Sale Patti / GST Sale bills on this date that still have hamali = 0 --
// candidates to quickly add "on us" hamali to after the fact (e.g. forgot
// to set it when creating the bill).
export async function getZeroHamaliSaleBillsForDate(date: string, loc: Loc) {
  return db
    .select({
      id: schema.bills.id,
      kind: schema.bills.kind,
      no: schema.bills.no,
      loc: schema.bills.loc,
      customer: schema.bills.customer,
      bags: sql<number>`coalesce(sum(${schema.billItems.bags}), 0)::int`,
    })
    .from(schema.bills)
    .leftJoin(schema.billItems, eq(schema.billItems.billId, schema.bills.id))
    .where(
      and(
        eq(schema.bills.date, date),
        sql`${schema.bills.kind} IN ('psale', 'gst')`,
        sql`${schema.bills.hamali}::numeric = 0`,
        atLoc(schema.bills.loc, loc),
      ),
    )
    .groupBy(schema.bills.id)
    .orderBy(schema.bills.no);
}

export async function getHamaliPaidForDate(date: string, loc: Loc) {
  return db.query.hamaliPaid.findFirst({
    where: and(eq(schema.hamaliPaid.date, date), eq(schema.hamaliPaid.loc, loc)),
  });
}

export async function getHamaliLoadsForDate(date: string, loc: Loc) {
  return db
    .select()
    .from(schema.hamaliLoads)
    .where(and(eq(schema.hamaliLoads.date, date), atLoc(schema.hamaliLoads.loc, loc)))
    .orderBy(desc(schema.hamaliLoads.createdAt));
}

export async function getRecentHamaliDays(loc: Loc, limit = 14) {
  // Days (latest first) where there's hamali on either side — loaded (sale
  // bills) or unloaded (incoming loads).
  const [billDates, loadDates] = await Promise.all([
    db
      .selectDistinct({ date: schema.bills.date })
      .from(schema.bills)
      .where(and(sql`${schema.bills.hamali}::numeric > 0`, atLoc(schema.bills.loc, loc))),
    db
      .selectDistinct({ date: schema.hamaliLoads.date })
      .from(schema.hamaliLoads)
      .where(atLoc(schema.hamaliLoads.loc, loc)),
  ]);
  const dates = Array.from(
    new Set([...billDates, ...loadDates].map((r) => r.date)),
  )
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .slice(0, limit);

  const result: {
    date: string;
    loadedBags: number;
    loadedAmount: number;
    unloadedBags: number;
    unloadedAmount: number;
    totalBags: number;
    totalAmount: number;
    paid: { amount: string; mode: "Cash" | "UPI" | "CJ" } | null;
  }[] = [];
  for (const date of dates) {
    const [h, loads, paid] = await Promise.all([
      getHamaliForDate(date, loc),
      getHamaliLoadsForDate(date, loc),
      getHamaliPaidForDate(date, loc),
    ]);
    const unloadedBags = loads.reduce((s, l) => s + l.bags, 0);
    const unloadedAmount = loads.reduce((s, l) => s + Number(l.amount), 0);
    result.push({
      date,
      loadedBags: h.totalBags,
      loadedAmount: h.totalAmount,
      unloadedBags,
      unloadedAmount,
      totalBags: h.totalBags + unloadedBags,
      totalAmount: h.totalAmount + unloadedAmount,
      paid: paid ? { amount: paid.amount, mode: paid.mode } : null,
    });
  }
  return result;
}
