import { asc, eq, sql } from "drizzle-orm";
import { db, schema, type DbExecutor } from "@/db";
import { atLoc, type Loc } from "@/lib/loc";

// Note: `getOldDues` previously used a correlated subquery
//   coalesce((select sum(amount) from opening_payments where opening_due_id = ${schema.openingDues.id}), 0)
// Drizzle's sql`` template doesn't always rewrite the column reference inside
// the nested subquery against the outer alias, so the inner query matched 0
// rows for every outer row and returned 0 paid everywhere. The LEFT JOIN +
// GROUP BY form below avoids the correlation entirely and is identical in
// cost on an indexed FK.

export type OldDue = {
  id: string;
  customer: string;
  amount: number;
  paid: number;
  due: number;
  date: string;
  note: string | null;
  createdAt: Date;
};

/** One store's old dues (and "Advance received" markers). */
export async function getOldDues(loc: Loc, exec: DbExecutor = db): Promise<OldDue[]> {
  const rows = await exec
    .select({
      id: schema.openingDues.id,
      customer: schema.openingDues.customer,
      amount: schema.openingDues.amount,
      date: schema.openingDues.date,
      note: schema.openingDues.note,
      createdAt: schema.openingDues.createdAt,
      paid: sql<string>`coalesce(sum(${schema.openingPayments.amount}), 0)`,
    })
    .from(schema.openingDues)
    .leftJoin(
      schema.openingPayments,
      eq(schema.openingPayments.openingDueId, schema.openingDues.id),
    )
    .where(atLoc(schema.openingDues.loc, loc))
    .groupBy(schema.openingDues.id)
    .orderBy(asc(schema.openingDues.date), asc(schema.openingDues.createdAt));

  return rows.map((r) => {
    const amount = Number(r.amount);
    const paid = Number(r.paid);
    return {
      id: r.id,
      customer: r.customer,
      amount,
      paid,
      due: amount - paid,
      date: r.date,
      note: r.note,
      createdAt: r.createdAt,
    };
  });
}

export async function getOldDuesSummary(loc: Loc, exec: DbExecutor = db) {
  const dues = await getOldDues(loc, exec);
  const total = dues.reduce((s, d) => s + d.amount, 0);
  const paid = dues.reduce((s, d) => s + d.paid, 0);
  const unique = new Set(dues.map((d) => d.customer.trim().toLowerCase())).size;
  return { total, paid, outstanding: total - paid, customers: unique, count: dues.length };
}
