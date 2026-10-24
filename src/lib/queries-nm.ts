import { desc, sql } from "drizzle-orm";
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

/** Simple lookup, used by the transfer form. */
export async function getActiveLotsForTransfer() {
  return db
    .select({ id: schema.lots.id, name: schema.lots.name })
    .from(schema.lots)
    .where(sql`${schema.lots.deletedAt} IS NULL`)
    .orderBy(schema.lots.name);
}
