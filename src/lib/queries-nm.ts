import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export async function getLatestTransfers(limit = 30) {
  return db
    .select({
      id: schema.transfers.id,
      lotId: schema.transfers.lotId,
      lotName: schema.transfers.lotNameSnapshot,
      bags: schema.transfers.bags,
      dir: schema.transfers.dir,
      date: schema.transfers.date,
      note: schema.transfers.note,
      createdAt: schema.transfers.createdAt,
    })
    .from(schema.transfers)
    .orderBy(desc(schema.transfers.date), desc(schema.transfers.createdAt))
    .limit(limit);
}

export async function getTransferTotals() {
  const [row] = await db
    .select({
      out: sql<number>`coalesce(sum(case when ${schema.transfers.dir} = 'out' then ${schema.transfers.bags} else 0 end), 0)::int`,
      back: sql<number>`coalesce(sum(case when ${schema.transfers.dir} = 'back' then ${schema.transfers.bags} else 0 end), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.transfers);
  return row ?? { out: 0, back: 0, count: 0 };
}

export async function getBillsByDateAndLoc(date: string, loc: string | null) {
  return db
    .select()
    .from(schema.bills)
    .where(
      loc === "NM"
        ? sql`${schema.bills.date} = ${date} AND ${schema.bills.loc} = 'NM'`
        : sql`${schema.bills.date} = ${date} AND (${schema.bills.loc} IS NULL OR ${schema.bills.loc} <> 'NM')`,
    )
    .orderBy(schema.bills.no);
}

/** Simple lookup, used by the transfer form. */
export async function getActiveLotsForTransfer() {
  return db
    .select({ id: schema.lots.id, name: schema.lots.name })
    .from(schema.lots)
    .where(sql`${schema.lots.deletedAt} IS NULL`)
    .orderBy(schema.lots.name);
}

export async function getNmSalesSummary(date: string) {
  // Totals for New Mahavir bills on a given date.
  const [row] = await db
    .select({
      bills: sql<number>`count(distinct ${schema.bills.id})::int`,
      bags: sql<number>`coalesce(sum(${schema.billItems.bags}), 0)::int`,
      sales: sql<string>`coalesce(sum(distinct ${schema.bills.total}), 0)`,
    })
    .from(schema.bills)
    .leftJoin(schema.billItems, eq(schema.billItems.billId, schema.bills.id))
    .where(sql`${schema.bills.date} = ${date} AND ${schema.bills.loc} = 'NM'`);
  return {
    bills: Number(row?.bills ?? 0),
    bags: Number(row?.bags ?? 0),
    sales: Number(row?.sales ?? 0),
  };
}
