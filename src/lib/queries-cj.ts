import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema, type DbExecutor } from "@/db";
import { getSettings } from "@/lib/queries";
import { atLoc, openingsFor, type Loc } from "@/lib/loc";

export async function getCjPaymentsLatest(loc: Loc, limit = 40) {
  // CJ-mode receipts on one store's bills, latest first.
  return db
    .select({
      id: schema.payments.id,
      date: schema.payments.date,
      amount: schema.payments.amount,
      billId: schema.payments.billId,
      billNo: schema.bills.no,
      billKind: schema.bills.kind,
      customer: schema.bills.customer,
      loc: schema.bills.loc,
    })
    .from(schema.payments)
    .innerJoin(schema.bills, eq(schema.payments.billId, schema.bills.id))
    .where(and(eq(schema.payments.mode, "CJ"), atLoc(schema.bills.loc, loc)))
    .orderBy(desc(schema.payments.date), desc(schema.payments.createdAt))
    .limit(limit);
}

export async function getCjSettlementsLatest(loc: Loc, limit = 50) {
  return db
    .select()
    .from(schema.cjSettlements)
    .where(atLoc(schema.cjSettlements.loc, loc))
    .orderBy(desc(schema.cjSettlements.date), desc(schema.cjSettlements.createdAt))
    .limit(limit);
}

/** Money CJ is holding for ONE store. */
export async function getCjTotals(loc: Loc, exec: DbExecutor = db) {
  const settings = await getSettings(exec);
  const [recv] = await exec
    .select({ s: sql<string>`coalesce(sum(${schema.payments.amount}), 0)` })
    .from(schema.payments)
    .innerJoin(schema.bills, eq(schema.bills.id, schema.payments.billId))
    .where(and(eq(schema.payments.mode, "CJ"), atLoc(schema.bills.loc, loc)));
  const [paid] = await exec
    .select({ s: sql<string>`coalesce(sum(${schema.cjSettlements.amount}), 0)` })
    .from(schema.cjSettlements)
    .where(atLoc(schema.cjSettlements.loc, loc));
  const today = new Date().toISOString().slice(0, 10);
  const [todayRecv] = await exec
    .select({ s: sql<string>`coalesce(sum(${schema.payments.amount}), 0)` })
    .from(schema.payments)
    .innerJoin(schema.bills, eq(schema.bills.id, schema.payments.billId))
    .where(
      sql`${schema.payments.mode} = 'CJ' AND ${schema.payments.date} = ${today} AND ${atLoc(schema.bills.loc, loc)}`,
    );
  const got = Number(recv?.s ?? 0);
  const settled = Number(paid?.s ?? 0);
  // CJ money carried forward from closed financial years.
  const opening = openingsFor(settings, loc).cj;
  return {
    opening,
    received: got,
    settled,
    outstanding: opening + got - settled,
    receivedToday: Number(todayRecv?.s ?? 0),
  };
}
