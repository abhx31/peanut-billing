import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema, type DbExecutor } from "@/db";

export type LotWithStock = {
  id: string;
  name: string;
  added: number;
  sold: number;
  left: number;
  kgSold: number;
  /** Bags transferred to New Mahavir and still there (xfer out − xfer back). */
  recvN: number;
  /** Bags sold at New Mahavir. */
  soldN: number;
  /** Bags left at the Main store. */
  stkM: number;
  /** Bags left at New Mahavir. */
  stkN: number;
  deletedAt: Date | null;
};

export async function getLotsWithStock(
  opts: { includeDeleted?: boolean } = {},
  exec: DbExecutor = db,
): Promise<LotWithStock[]> {
  const addedRows = await exec
    .select({
      lotId: schema.stockIn.lotId,
      bagsAdded: sql<number>`coalesce(sum(${schema.stockIn.bags}), 0)::int`,
      bagsAddedNM: sql<number>`coalesce(sum(case when ${schema.stockIn.loc} = 'NM' then ${schema.stockIn.bags} else 0 end), 0)::int`,
    })
    .from(schema.stockIn)
    .groupBy(schema.stockIn.lotId);
  const addedMap = new Map(
    addedRows.map((r) => [r.lotId, { total: r.bagsAdded, nm: r.bagsAddedNM }]),
  );

  // Total sold across the item + split by store (NM vs Main).
  const soldRows = await exec
    .select({
      lotId: schema.billItems.lotId,
      bagsSold: sql<number>`coalesce(sum(${schema.billItems.bags}), 0)::int`,
      bagsSoldNM: sql<number>`coalesce(sum(case when ${schema.bills.loc} = 'NM' then ${schema.billItems.bags} else 0 end), 0)::int`,
      kgSold: sql<string>`coalesce(sum(${schema.billItems.kg}), 0)`,
    })
    .from(schema.billItems)
    .innerJoin(schema.bills, eq(schema.billItems.billId, schema.bills.id))
    .groupBy(schema.billItems.lotId);
  const soldMap = new Map(soldRows.map((r) => [r.lotId, r]));

  // Transfers out of Main / back from NM.
  const xferRows = await exec
    .select({
      lotId: schema.transfers.lotId,
      out: sql<number>`coalesce(sum(case when ${schema.transfers.dir} = 'out' then ${schema.transfers.bags} else 0 end), 0)::int`,
      back: sql<number>`coalesce(sum(case when ${schema.transfers.dir} = 'back' then ${schema.transfers.bags} else 0 end), 0)::int`,
    })
    .from(schema.transfers)
    .groupBy(schema.transfers.lotId);
  const xferMap = new Map(xferRows.map((r) => [r.lotId, r]));

  const lots = await exec
    .select()
    .from(schema.lots)
    .where(opts.includeDeleted ? undefined : isNull(schema.lots.deletedAt))
    .orderBy(desc(schema.lots.createdAt));

  return lots.map((l) => {
    const addedEntry = addedMap.get(l.id);
    const added = addedEntry?.total ?? 0;
    const addedNM = addedEntry?.nm ?? 0;
    const addedMain = added - addedNM;
    const sold = soldMap.get(l.id)?.bagsSold ?? 0;
    const soldNM = soldMap.get(l.id)?.bagsSoldNM ?? 0;
    const soldMain = sold - soldNM;
    const kg = soldMap.get(l.id)?.kgSold ?? "0";
    const xferOut = xferMap.get(l.id)?.out ?? 0;
    const xferBack = xferMap.get(l.id)?.back ?? 0;
    const recvN = xferOut - xferBack;
    const stkM = addedMain - xferOut + xferBack - soldMain;
    const stkN = addedNM + xferOut - xferBack - soldNM;
    return {
      id: l.id,
      name: l.name,
      added,
      sold,
      left: added - sold,
      kgSold: Number(kg),
      recvN,
      soldN: soldNM,
      stkM,
      stkN,
      deletedAt: l.deletedAt,
    };
  });
}

export async function getLotCosts(): Promise<Record<string, string>> {
  const rows = await db.select().from(schema.lotCosts);
  return Object.fromEntries(rows.map((r) => [r.lotId, r.costPerKg]));
}

export async function getSettings(exec: DbExecutor = db) {
  const [row] = await exec.select().from(schema.settings).where(eq(schema.settings.id, 1));
  return (
    row ?? {
      id: 1,
      firm: "Peanut Traders",
      hamaliDefault: "10",
      openingCash: "0",
      openingBank: "0",
      cjOpening: "0",
      extras: null,
      letterheadImage: null,
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
  hsn: string | null;
  description: string | null;
  profit: number | null;
};

export type BillRow = {
  id: string;
  no: number;
  kind: "normal" | "gst" | "psale";
  fy: string;
  date: string;
  customer: string;
  customerPhone: string | null;
  loc: "MS" | "NM";
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
  /** Customer balance BEFORE this bill (snapshot at bill creation). null for pre-v2 bills. */
  prev: number | null;
  /** Amount paid at bill creation (snapshot). null for pre-v2 bills. */
  paidNow: number | null;
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
      hsn: it.hsn,
      description: it.description,
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
      kind: b.kind,
      fy: b.fy,
      date: b.date,
      customer: b.customer,
      customerPhone: b.customerPhone,
      loc: b.loc === "NM" ? "NM" : "MS",
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
      prev: b.prev != null ? Number(b.prev) : null,
      paidNow: b.paidNow != null ? Number(b.paidNow) : null,
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
      billLoc: schema.bills.loc,
      mode: schema.payments.mode,
      amount: schema.payments.amount,
      date: schema.payments.date,
      note: schema.payments.note,
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
      loc: schema.stockIn.loc,
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

export async function getSalesSeries(days: number, loc?: "MS" | "NM") {
  // Returns last N days of sales totals (one row per day, zero-filled).
  // When loc is provided, only bills from that store are counted.
  // Legacy rows written with NULL are treated as Main store ("MS").
  const locFilter =
    loc === undefined
      ? sql``
      : sql` AND COALESCE(b.loc, 'MS') = ${loc}`;
  const rows = await db.execute<{ d: string; total: string; bills: number }>(sql`
    SELECT to_char(d::date, 'YYYY-MM-DD') AS d,
           COALESCE(SUM(b.total), 0)::text AS total,
           COUNT(b.id)::int AS bills
    FROM generate_series(
           (CURRENT_DATE - (${days - 1}::int)),
           CURRENT_DATE,
           '1 day'::interval
         ) AS d
    LEFT JOIN bills b ON b.date = d::date${locFilter}
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
// If a `closings` row exists on-or-before `before`, we use the latest such row as the
// anchor and add only flows that happened AFTER that closing's date.
export async function cashBalanceBefore(
  mode: "Cash" | "UPI",
  before: string,
  exec: DbExecutor = db,
) {
  const col = mode === "Cash" ? schema.closings.cash : schema.closings.bank;
  const [latestClose] = await exec
    .select({ date: schema.closings.date, value: col })
    .from(schema.closings)
    .where(sql`${schema.closings.date} < ${before} AND ${col} IS NOT NULL`)
    .orderBy(desc(schema.closings.date))
    .limit(1);

  let base: number;
  const after = latestClose?.date ?? null;
  if (latestClose && latestClose.value != null) {
    base = Number(latestClose.value);
  } else {
    const settings = await getSettings(exec);
    base = mode === "Cash" ? Number(settings.openingCash) : Number(settings.openingBank);
  }

  const dateCond = after
    ? sql`${schema.payments.date} > ${after} AND ${schema.payments.date} < ${before}`
    : sql`${schema.payments.date} < ${before}`;
  const exCond = after
    ? sql`${schema.expenses.date} > ${after} AND ${schema.expenses.date} < ${before}`
    : sql`${schema.expenses.date} < ${before}`;
  const cjCond = after
    ? sql`${schema.cjSettlements.date} > ${after} AND ${schema.cjSettlements.date} < ${before}`
    : sql`${schema.cjSettlements.date} < ${before}`;
  const pattiCond = after
    ? sql`${schema.pattiBills.paidDate} IS NOT NULL AND ${schema.pattiBills.paidDate} > ${after} AND ${schema.pattiBills.paidDate} < ${before}`
    : sql`${schema.pattiBills.paidDate} IS NOT NULL AND ${schema.pattiBills.paidDate} < ${before}`;

  const [pr] = await exec
    .select({ s: sql<string>`coalesce(sum(${schema.payments.amount}), 0)` })
    .from(schema.payments)
    .where(and(eq(schema.payments.mode, mode), dateCond));
  const [ex] = await exec
    .select({ s: sql<string>`coalesce(sum(${schema.expenses.amount}), 0)` })
    .from(schema.expenses)
    .where(and(eq(schema.expenses.mode, mode), exCond));
  const [cj] = await exec
    .select({ s: sql<string>`coalesce(sum(${schema.cjSettlements.amount}), 0)` })
    .from(schema.cjSettlements)
    .where(and(eq(schema.cjSettlements.mode, mode), cjCond));
  const [patti] = await exec
    .select({ s: sql<string>`coalesce(sum(${schema.pattiBills.net}), 0)` })
    .from(schema.pattiBills)
    .where(and(eq(schema.pattiBills.paidMode, mode), pattiCond));

  // Also credit opening-due payments received in this mode.
  const opayCond = after
    ? sql`${schema.openingPayments.date} > ${after} AND ${schema.openingPayments.date} < ${before}`
    : sql`${schema.openingPayments.date} < ${before}`;
  const [op] = await exec
    .select({ s: sql<string>`coalesce(sum(${schema.openingPayments.amount}), 0)` })
    .from(schema.openingPayments)
    .where(and(eq(schema.openingPayments.mode, mode), opayCond));

  return (
    base +
    Number(pr?.s ?? 0) +
    Number(cj?.s ?? 0) +
    Number(op?.s ?? 0) -
    Number(ex?.s ?? 0) -
    Number(patti?.s ?? 0)
  );
}

export type CustomerBalance = {
  name: string;
  /** Legacy "billed" (bill totals only). Does NOT include old dues — see totalBilled. */
  billed: number;
  /** Legacy "paid" against bills only. See totalPaid for the full picture. */
  paid: number;
  /** Legacy bill-only balance; prefer `totalBalance` for display. */
  balance: number;
  /** Opening balance from before the app started tracking (sum of opening_dues). */
  openingDue: number;
  /** Payments received against opening dues. */
  openingPaid: number;
  /** billed + openingDue (what the customer was ever on the hook for). */
  totalBilled: number;
  /** paid + openingPaid (every receipt from this customer). */
  totalPaid: number;
  /** totalBilled − totalPaid (negative means the customer is in advance). */
  totalBalance: number;
};

/**
 * Case-insensitive, whitespace-collapsed key for matching customer names
 * across bills and opening dues. Mirrors inspiration's `key(name)`.
 */
export function customerKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Sticky-note text keyed by customerKey(name). Empty map if none exist. */
export async function getCustomerNotes(
  exec: DbExecutor = db,
): Promise<Map<string, string>> {
  const rows = await exec.select().from(schema.customerNotes);
  return new Map(rows.map((r) => [r.customerKey, r.note]));
}

export async function getCustomerBalances(
  exec: DbExecutor = db,
): Promise<CustomerBalance[]> {
  const bills = await exec
    .select({
      customer: schema.bills.customer,
      billed: sql<string>`coalesce(sum(${schema.bills.total}), 0)`,
    })
    .from(schema.bills)
    .groupBy(schema.bills.customer);

  const pays = await exec
    .select({
      customer: schema.bills.customer,
      paid: sql<string>`coalesce(sum(${schema.payments.amount}), 0)`,
    })
    .from(schema.payments)
    .innerJoin(schema.bills, eq(schema.payments.billId, schema.bills.id))
    .groupBy(schema.bills.customer);

  const dues = await exec
    .select({
      customer: schema.openingDues.customer,
      openingDue: sql<string>`coalesce(sum(${schema.openingDues.amount}), 0)`,
    })
    .from(schema.openingDues)
    .groupBy(schema.openingDues.customer);

  const duePays = await exec
    .select({
      customer: schema.openingPayments.customer,
      openingPaid: sql<string>`coalesce(sum(${schema.openingPayments.amount}), 0)`,
    })
    .from(schema.openingPayments)
    .groupBy(schema.openingPayments.customer);

  // Merge by name-key so case / whitespace differences collapse into one row.
  type Row = {
    display: string;
    billed: number;
    paid: number;
    openingDue: number;
    openingPaid: number;
  };
  const map = new Map<string, Row>();
  const get = (name: string): Row => {
    const k = customerKey(name);
    let r = map.get(k);
    if (!r) {
      r = { display: name, billed: 0, paid: 0, openingDue: 0, openingPaid: 0 };
      map.set(k, r);
    }
    return r;
  };
  for (const b of bills) get(b.customer).billed += Number(b.billed);
  for (const p of pays) get(p.customer).paid += Number(p.paid);
  for (const d of dues) get(d.customer).openingDue += Number(d.openingDue);
  for (const p of duePays) get(p.customer).openingPaid += Number(p.openingPaid);

  return Array.from(map.values())
    .map((r) => {
      const totalBilled = r.billed + r.openingDue;
      const totalPaid = r.paid + r.openingPaid;
      return {
        name: r.display,
        billed: r.billed,
        paid: r.paid,
        balance: r.billed - r.paid,
        openingDue: r.openingDue,
        openingPaid: r.openingPaid,
        totalBilled,
        totalPaid,
        totalBalance: totalBilled - totalPaid,
      };
    })
    .sort((a, b) => b.totalBalance - a.totalBalance);
}

/** { customerKey -> list of unpaid bills (date, no, kind, loc, balance) }. */
export async function getPendingBillsByCustomer(): Promise<
  Map<
    string,
    Array<{
      id: string;
      no: number;
      kind: "normal" | "gst" | "psale";
      loc: "MS" | "NM";
      date: string;
      total: number;
      balance: number;
    }>
  >
> {
  const rows = await db
    .select({
      id: schema.bills.id,
      no: schema.bills.no,
      kind: schema.bills.kind,
      loc: schema.bills.loc,
      date: schema.bills.date,
      customer: schema.bills.customer,
      total: schema.bills.total,
      paid: sql<string>`coalesce((select sum(amount) from payments where bill_id = ${schema.bills.id}), 0)`,
    })
    .from(schema.bills)
    .orderBy(asc(schema.bills.date), asc(schema.bills.no));

  const map = new Map<
    string,
    Array<{
      id: string;
      no: number;
      kind: "normal" | "gst" | "psale";
      loc: "MS" | "NM";
      date: string;
      total: number;
      balance: number;
    }>
  >();
  for (const r of rows) {
    const bal = Number(r.total) - Number(r.paid);
    if (bal <= 0.005) continue;
    const k = customerKey(r.customer);
    const arr = map.get(k) ?? [];
    arr.push({
      id: r.id,
      no: r.no,
      kind: r.kind as "normal" | "gst" | "psale",
      loc: r.loc === "NM" ? "NM" : "MS",
      date: r.date,
      total: Number(r.total),
      balance: bal,
    });
    map.set(k, arr);
  }
  return map;
}

/** All ledger events for one customer, in time order (oldest first). */
export type StatementRow =
  | { kind: "due"; id: string; date: string; amount: number; note: string | null }
  | {
      kind: "bill";
      id: string;
      billNo: number;
      billKind: "normal" | "gst" | "psale";
      date: string;
      total: number;
    }
  | {
      kind: "receipt-due";
      id: string;
      date: string;
      amount: number;
      mode: "Cash" | "UPI" | "CJ";
      dueId: string;
    }
  | {
      kind: "receipt-bill";
      id: string;
      date: string;
      amount: number;
      mode: "Cash" | "UPI" | "CJ";
      billId: string;
      billNo: number;
      billKind: "normal" | "gst" | "psale";
    };

export async function getCustomerStatement(name: string): Promise<{
  customer: string;
  rows: StatementRow[];
  totals: {
    billed: number;
    openingDue: number;
    received: number;
    balance: number;
  };
}> {
  const key = customerKey(name);
  const billMatches = sql`lower(regexp_replace(trim(${schema.bills.customer}), '\\s+', ' ', 'g')) = ${key}`;
  const dueMatches = sql`lower(regexp_replace(trim(${schema.openingDues.customer}), '\\s+', ' ', 'g')) = ${key}`;

  const [dues, bills, payments, duePayments] = await Promise.all([
    db
      .select({
        id: schema.openingDues.id,
        date: schema.openingDues.date,
        amount: schema.openingDues.amount,
        note: schema.openingDues.note,
      })
      .from(schema.openingDues)
      .where(dueMatches)
      .orderBy(asc(schema.openingDues.date), asc(schema.openingDues.createdAt)),
    db
      .select({
        id: schema.bills.id,
        no: schema.bills.no,
        kind: schema.bills.kind,
        date: schema.bills.date,
        total: schema.bills.total,
        customer: schema.bills.customer,
      })
      .from(schema.bills)
      .where(billMatches)
      .orderBy(asc(schema.bills.date), asc(schema.bills.no)),
    db
      .select({
        id: schema.payments.id,
        date: schema.payments.date,
        amount: schema.payments.amount,
        mode: schema.payments.mode,
        billId: schema.payments.billId,
        billNo: schema.bills.no,
        billKind: schema.bills.kind,
      })
      .from(schema.payments)
      .innerJoin(schema.bills, eq(schema.bills.id, schema.payments.billId))
      .where(billMatches)
      .orderBy(asc(schema.payments.date), asc(schema.payments.createdAt)),
    db
      .select({
        id: schema.openingPayments.id,
        date: schema.openingPayments.date,
        amount: schema.openingPayments.amount,
        mode: schema.openingPayments.mode,
        dueId: schema.openingPayments.openingDueId,
      })
      .from(schema.openingPayments)
      .where(sql`lower(regexp_replace(trim(${schema.openingPayments.customer}), '\\s+', ' ', 'g')) = ${key}`)
      .orderBy(
        asc(schema.openingPayments.date),
        asc(schema.openingPayments.createdAt),
      ),
  ]);

  const customer =
    bills[0]?.customer ?? dues[0]?.id
      ? (bills[0]?.customer ?? name)
      : name;

  const rows: StatementRow[] = [];
  for (const d of dues) {
    rows.push({
      kind: "due",
      id: d.id,
      date: d.date,
      amount: Number(d.amount),
      note: d.note,
    });
  }
  for (const b of bills) {
    rows.push({
      kind: "bill",
      id: b.id,
      billNo: b.no,
      billKind: b.kind as "normal" | "gst" | "psale",
      date: b.date,
      total: Number(b.total),
    });
  }
  for (const p of payments) {
    rows.push({
      kind: "receipt-bill",
      id: p.id,
      date: p.date,
      amount: Number(p.amount),
      mode: p.mode as "Cash" | "UPI" | "CJ",
      billId: p.billId,
      billNo: p.billNo,
      billKind: p.billKind as "normal" | "gst" | "psale",
    });
  }
  for (const p of duePayments) {
    rows.push({
      kind: "receipt-due",
      id: p.id,
      date: p.date,
      amount: Number(p.amount),
      mode: p.mode as "Cash" | "UPI" | "CJ",
      dueId: p.dueId,
    });
  }
  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.kind === "due" ? -2 : a.kind === "bill" ? -1 : 0) -
        (b.kind === "due" ? -2 : b.kind === "bill" ? -1 : 0),
  );

  const billedTotal = bills.reduce((s, b) => s + Number(b.total), 0);
  const openingDueTotal = dues.reduce((s, d) => s + Number(d.amount), 0);
  const received =
    payments.reduce((s, p) => s + Number(p.amount), 0) +
    duePayments.reduce((s, p) => s + Number(p.amount), 0);
  return {
    customer,
    rows,
    totals: {
      billed: billedTotal,
      openingDue: openingDueTotal,
      received,
      balance: billedTotal + openingDueTotal - received,
    },
  };
}
