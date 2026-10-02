import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export async function getLotsWithStock(opts: { includeDeleted?: boolean } = {}) {
  const addedRows = await db
    .select({
      lotId: schema.stockIn.lotId,
      bagsAdded: sql<number>`coalesce(sum(${schema.stockIn.bags}), 0)::int`,
    })
    .from(schema.stockIn)
    .groupBy(schema.stockIn.lotId);
  const addedMap = new Map(addedRows.map((r) => [r.lotId, r.bagsAdded]));

  const soldRows = await db
    .select({
      lotId: schema.billItems.lotId,
      bagsSold: sql<number>`coalesce(sum(${schema.billItems.bags}), 0)::int`,
      kgSold: sql<string>`coalesce(sum(${schema.billItems.kg}), 0)`,
    })
    .from(schema.billItems)
    .groupBy(schema.billItems.lotId);
  const soldMap = new Map(soldRows.map((r) => [r.lotId, r]));

  const lots = await db
    .select()
    .from(schema.lots)
    .where(opts.includeDeleted ? undefined : isNull(schema.lots.deletedAt))
    .orderBy(desc(schema.lots.createdAt));

  return lots.map((l) => {
    const added = addedMap.get(l.id) ?? 0;
    const sold = soldMap.get(l.id)?.bagsSold ?? 0;
    const kg = soldMap.get(l.id)?.kgSold ?? "0";
    return {
      id: l.id,
      name: l.name,
      added,
      sold,
      left: added - sold,
      kgSold: Number(kg),
      deletedAt: l.deletedAt,
    };
  });
}

export async function getLotCosts(): Promise<Record<string, string>> {
  const rows = await db.select().from(schema.lotCosts);
  return Object.fromEntries(rows.map((r) => [r.lotId, r.costPerKg]));
}

export async function getSettings() {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));
  return (
    row ?? {
      id: 1,
      firm: "Peanut Traders",
      hamaliDefault: "10",
      openingCash: "0",
      openingBank: "0",
      extras: null,
      updatedAt: new Date(),
    }
  );
}

export async function getAllUsers() {
  return db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      disabled: schema.users.disabled,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(asc(schema.users.createdAt));
}

export async function getCustomerNames() {
  const rows = await db
    .selectDistinct({ customer: schema.bills.customer })
    .from(schema.bills)
    .orderBy(schema.bills.customer);
  return rows.map((r) => r.customer);
}

export type BillLineRow = {
  id: string;
  position: number;
  lotId: string;
  lotName: string;
  bags: number;
  kg: number;
  rate: number;
  amount: number;
  weightsText: string | null;
  profit: number | null;
};

export type BillRow = {
  id: string;
  no: number;
  fy: string;
  date: string;
  customer: string;
  bags: number;
  kg: number;
  amount: number;
  hamali: number;
  hamaliPerBag: number;
  gstPercent: number;
  gst: number;
  total: number;
  paid: number;
  balance: number;
  profit: number | null;
  items: BillLineRow[];
  // Convenience view for list displays: lot name of first item, or "Multiple" if >1.
  lotSummary: string;
  itemCount: number;
};

async function enrichBills(
  rows: (typeof schema.bills.$inferSelect)[],
  isOwner: boolean,
): Promise<BillRow[]> {
  if (rows.length === 0) return [];
  const billIds = rows.map((b) => b.id);

  const payRows = await db
    .select({
      billId: schema.payments.billId,
      paid: sql<string>`coalesce(sum(${schema.payments.amount}), 0)`,
    })
    .from(schema.payments)
    .where(inArray(schema.payments.billId, billIds))
    .groupBy(schema.payments.billId);
  const paidMap = new Map(payRows.map((r) => [r.billId, Number(r.paid)]));

  const itemRows = await db
    .select()
    .from(schema.billItems)
    .where(inArray(schema.billItems.billId, billIds))
    .orderBy(asc(schema.billItems.billId), asc(schema.billItems.position));

  let costs: Record<string, number> = {};
  if (isOwner) {
    const costRows = await db.select().from(schema.lotCosts);
    costs = Object.fromEntries(costRows.map((c) => [c.lotId, Number(c.costPerKg)]));
  }

  const itemsByBill = new Map<string, BillLineRow[]>();
  for (const it of itemRows) {
    const kg = Number(it.kg);
    const amount = Number(it.amount);
    const cost = costs[it.lotId] ?? 0;
    const line: BillLineRow = {
      id: it.id,
      position: it.position,
      lotId: it.lotId,
      lotName: it.lotNameSnapshot,
      bags: it.bags,
      kg,
      rate: Number(it.rate),
      amount,
      weightsText: it.weightsText,
      profit: isOwner ? amount - kg * cost : null,
    };
    const arr = itemsByBill.get(it.billId) ?? [];
    arr.push(line);
    itemsByBill.set(it.billId, arr);
  }

  return rows.map((b) => {
    const paid = paidMap.get(b.id) ?? 0;
    const total = Number(b.total);
    const amount = Number(b.amount);
    const items = itemsByBill.get(b.id) ?? [];
    const totalBags = items.reduce((s, it) => s + it.bags, 0);
    const totalKg = items.reduce((s, it) => s + it.kg, 0);
    const profit = isOwner
      ? items.reduce((s, it) => s + (it.profit ?? 0), 0)
      : null;
    const lotSummary =
      items.length === 0
        ? "—"
        : items.length === 1
          ? items[0].lotName
          : `${items[0].lotName} +${items.length - 1} more`;
    return {
      id: b.id,
      no: b.no,
      fy: b.fy,
      date: b.date,
      customer: b.customer,
      bags: totalBags,
      kg: totalKg,
      amount,
      hamali: Number(b.hamali),
      hamaliPerBag: Number(b.hamaliPerBag),
      gstPercent: Number(b.gstPercent),
      gst: Number(b.gst),
      total,
      paid,
      balance: total - paid,
      profit,
      items,
      lotSummary,
      itemCount: items.length,
    };
  });
}

export async function getBillsByDate(date: string, isOwner: boolean) {
  const rows = await db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.date, date))
    .orderBy(asc(schema.bills.no));
  return enrichBills(rows, isOwner);
}

export async function getBillById(id: string, isOwner: boolean) {
  const [row] = await db.select().from(schema.bills).where(eq(schema.bills.id, id));
  if (!row) return null;
  const [enriched] = await enrichBills([row], isOwner);
  return enriched;
}

export async function getAllBills(isOwner: boolean) {
  const rows = await db.select().from(schema.bills).orderBy(asc(schema.bills.no));
  return enrichBills(rows, isOwner);
}

export async function getPaymentsByBill(billId: string) {
  return db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.billId, billId))
    .orderBy(asc(schema.payments.createdAt));
}

export async function getExpensesByDate(date: string) {
  return db
    .select()
    .from(schema.expenses)
    .where(eq(schema.expenses.date, date))
    .orderBy(asc(schema.expenses.createdAt));
}

export async function getAllPaymentsOnDate(date: string) {
  return db
    .select({
      id: schema.payments.id,
      billId: schema.payments.billId,
      billNo: schema.bills.no,
      customer: schema.bills.customer,
      mode: schema.payments.mode,
      amount: schema.payments.amount,
      date: schema.payments.date,
    })
    .from(schema.payments)
    .innerJoin(schema.bills, eq(schema.payments.billId, schema.bills.id))
    .where(eq(schema.payments.date, date))
    .orderBy(asc(schema.bills.no));
}

export async function getStockHistory(limit = 30) {
  return db
    .select({
      id: schema.stockIn.id,
      lotId: schema.stockIn.lotId,
      lotName: schema.lots.name,
      bags: schema.stockIn.bags,
      date: schema.stockIn.date,
      createdAt: schema.stockIn.createdAt,
    })
    .from(schema.stockIn)
    .leftJoin(schema.lots, eq(schema.stockIn.lotId, schema.lots.id))
    .orderBy(desc(schema.stockIn.date), desc(schema.stockIn.createdAt))
    .limit(limit);
}

// Current running balance (all-time) for a cash/UPI mode.
export async function currentBalance(mode: "Cash" | "UPI") {
  const settings = await getSettings();
  const opening =
    mode === "Cash" ? Number(settings.openingCash) : Number(settings.openingBank);
  const [pr] = await db
    .select({ s: sql<string>`coalesce(sum(${schema.payments.amount}), 0)` })
    .from(schema.payments)
    .where(eq(schema.payments.mode, mode));
  const [ex] = await db
    .select({ s: sql<string>`coalesce(sum(${schema.expenses.amount}), 0)` })
    .from(schema.expenses)
    .where(eq(schema.expenses.mode, mode));
  return opening + Number(pr?.s ?? 0) - Number(ex?.s ?? 0);
}

export async function getSalesSeries(days: number) {
  // Returns last N days of sales totals (one row per day, zero-filled).
  const rows = await db.execute<{ d: string; total: string; bills: number }>(sql`
    SELECT to_char(d::date, 'YYYY-MM-DD') AS d,
           COALESCE(SUM(b.total), 0)::text AS total,
           COUNT(b.id)::int AS bills
    FROM generate_series(
           (CURRENT_DATE - (${days - 1}::int)),
           CURRENT_DATE,
           '1 day'::interval
         ) AS d
    LEFT JOIN bills b ON b.date = d::date
    GROUP BY d
    ORDER BY d
  `);
  return rows.rows.map((r) => ({
    date: r.d,
    total: Number(r.total),
    bills: Number(r.bills),
  }));
}

export async function getLatestBills(limit: number, isOwner: boolean) {
  const rows = await db
    .select()
    .from(schema.bills)
    .orderBy(desc(schema.bills.createdAt))
    .limit(limit);
  return enrichBills(rows, isOwner);
}

// Cash/bank running balance up to (but NOT including) `before` date.
export async function cashBalanceBefore(mode: "Cash" | "UPI", before: string) {
  const settings = await getSettings();
  const opening =
    mode === "Cash" ? Number(settings.openingCash) : Number(settings.openingBank);

  const [pr] = await db
    .select({ s: sql<string>`coalesce(sum(${schema.payments.amount}), 0)` })
    .from(schema.payments)
    .where(and(eq(schema.payments.mode, mode), sql`${schema.payments.date} < ${before}`));
  const [ex] = await db
    .select({ s: sql<string>`coalesce(sum(${schema.expenses.amount}), 0)` })
    .from(schema.expenses)
    .where(and(eq(schema.expenses.mode, mode), sql`${schema.expenses.date} < ${before}`));

  return opening + Number(pr?.s ?? 0) - Number(ex?.s ?? 0);
}

export type CustomerBalance = {
  name: string;
  billed: number;
  paid: number;
  balance: number;
};

export async function getCustomerBalances(): Promise<CustomerBalance[]> {
  const bills = await db
    .select({
      customer: schema.bills.customer,
      billed: sql<string>`coalesce(sum(${schema.bills.total}), 0)`,
    })
    .from(schema.bills)
    .groupBy(schema.bills.customer);

  const pays = await db
    .select({
      customer: schema.bills.customer,
      paid: sql<string>`coalesce(sum(${schema.payments.amount}), 0)`,
    })
    .from(schema.payments)
    .innerJoin(schema.bills, eq(schema.payments.billId, schema.bills.id))
    .groupBy(schema.bills.customer);

  const paidMap = new Map(pays.map((p) => [p.customer.toLowerCase(), Number(p.paid)]));

  return bills
    .map((b) => {
      const paid = paidMap.get(b.customer.toLowerCase()) ?? 0;
      const billed = Number(b.billed);
      return { name: b.customer, billed, paid, balance: billed - paid };
    })
    .sort((a, b) => b.balance - a.balance);
}
