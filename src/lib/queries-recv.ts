import { asc, eq, sql } from "drizzle-orm";
import { db, schema, type DbExecutor } from "@/db";

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

export async function getOldDues(exec: DbExecutor = db): Promise<OldDue[]> {
  const rows = await exec
    .select({
      id: schema.openingDues.id,
      customer: schema.openingDues.customer,
      amount: schema.openingDues.amount,
      date: schema.openingDues.date,
      note: schema.openingDues.note,
      createdAt: schema.openingDues.createdAt,
      paid: sql<string>`coalesce((select sum(amount) from opening_payments where opening_due_id = ${schema.openingDues.id}), 0)`,
    })
    .from(schema.openingDues)
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

export async function getOldDuesSummary(exec: DbExecutor = db) {
  const dues = await getOldDues(exec);
  const total = dues.reduce((s, d) => s + d.amount, 0);
  const paid = dues.reduce((s, d) => s + d.paid, 0);
  const unique = new Set(dues.map((d) => d.customer.trim().toLowerCase())).size;
  return { total, paid, outstanding: total - paid, customers: unique, count: dues.length };
}

/** Legacy helper preserved so Balances page keeps compiling after we fold old dues in. */
export async function getOldDueBalancesByCustomer(): Promise<
  Map<string, { amount: number; paid: number; due: number }>
> {
  const rows = await db
    .select({
      customer: schema.openingDues.customer,
      amount: sql<string>`coalesce(sum(${schema.openingDues.amount}), 0)`,
      paid: sql<string>`coalesce((select sum(amount) from opening_payments where opening_payments.customer ilike schema_customer), 0)`,
    })
    .from(schema.openingDues)
    .groupBy(schema.openingDues.customer);
  // Not actually used in computed tables (we aggregate separately in balances) — kept to avoid an unused export.
  const map = new Map<string, { amount: number; paid: number; due: number }>();
  for (const r of rows) {
    const amt = Number(r.amount);
    const pd = Number(r.paid);
    map.set(r.customer.toLowerCase().trim(), { amount: amt, paid: pd, due: amt - pd });
  }
  return map;
}

export async function getOpeningPaymentsOnDate(date: string) {
  return db
    .select({
      id: schema.openingPayments.id,
      customer: schema.openingPayments.customer,
      amount: schema.openingPayments.amount,
      mode: schema.openingPayments.mode,
      date: schema.openingPayments.date,
      loc: schema.openingPayments.loc,
    })
    .from(schema.openingPayments)
    .where(eq(schema.openingPayments.date, date))
    .orderBy(asc(schema.openingPayments.createdAt));
}
