import { gunzipSync, gzipSync } from "node:zlib";
import { and, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { db, schema, type DbExecutor } from "@/db";
import { cashBalanceBefore, getCustomerBalances, getLotsWithStock } from "@/lib/queries";
import { getCjTotals } from "@/lib/queries-cj";
import { getOldDuesSummary } from "@/lib/queries-recv";
import { fyOf, r2, today } from "@/lib/format";
import { locLabel, type Loc } from "@/lib/loc";

// Year-end close of FY X (after 31 Mar of X+1), in two steps:
//  1. createArchive: runs the whole close as a dry run (including the safety check below) and saves
//     its archive as "pending". Nothing is removed; entries dated in X are locked so the archive
//     cannot go stale while the owner checks it.
//  2. confirmArchive: after the owner has checked the archive, runs the close for real. It refuses
//     unless the rows it would remove are exactly the rows in the pending archive.
// The close itself:
//  - keeps every row that is still owed (bills with a balance, old dues, unpaid patti) live and untouched;
//  - removes settled rows dated up to 31 Mar of X+1 into a gzipped archive in `fy_archives`;
//  - carries running totals forward (31 Mar closing per store for cash/bank, settings.cj_opening /
//    cj_opening_nm for CJ, 1 Apr stock-in / transfer rows for stock) so every live figure is
//    unchanged;
//  - re-computes each store's customer credit, old dues, unpaid patti, cash, bank, CJ and stock
//    before and after, inside the same transaction, and rolls everything back if any of them moved.

export const FY_RE = /^\d{4}-\d{2}$/;

export type ArchiveStatus = "pending" | "closed";

export function fyBounds(fy: string) {
  const a = Number(fy.slice(0, 4));
  return { start: `${a}-04-01`, end: `${a + 1}-03-31`, nextStart: `${a + 1}-04-01` };
}

async function latestArchive(exec: DbExecutor) {
  const [row] = await exec
    .select({ fy: schema.fyArchives.fy, status: schema.fyArchives.status })
    .from(schema.fyArchives)
    .orderBy(desc(schema.fyArchives.fy))
    .limit(1);
  return row ?? null;
}

/** Last day of the latest archived year (pending or closed); entries up to it are locked. */
export async function closedThrough(exec: DbExecutor = db): Promise<string | null> {
  const latest = await latestArchive(exec);
  return latest ? fyBounds(latest.fy).end : null;
}

/** Error message when `date` falls inside an archived financial year, else null. */
export async function closedDateError(date: string): Promise<string | null> {
  const latest = await latestArchive(db);
  if (!latest) return null;
  const { start, end } = fyBounds(latest.fy);
  if (date > end) return null;
  if (latest.status === "pending" && date >= start) {
    return `${latest.fy} is archived and waiting for the owner's check, so its entries are locked. To change them, discard the archive in Settings first.`;
  }
  return `Financial year ${fyOf(date)} is closed. Use a date after ${end}.`;
}

/** The oldest financial year that still has records and has not been closed. */
export async function nextFyToClose(
  exec: DbExecutor = db,
): Promise<{ fy: string; end: string; canClose: boolean } | null> {
  const after = (await closedThrough(exec)) ?? "0001-01-01";
  // Old dues are left out: their dates are often from before the app was used.
  const res = await exec.execute<{ d: string | null }>(sql`
    SELECT min(d)::text AS d FROM (
      SELECT min(date) AS d FROM bills WHERE date > ${after}
      UNION ALL SELECT min(date) FROM payments WHERE date > ${after}
      UNION ALL SELECT min(date) FROM expenses WHERE date > ${after}
      UNION ALL SELECT min(date) FROM stock_in WHERE date > ${after}
      UNION ALL SELECT min(date) FROM transfers WHERE date > ${after}
      UNION ALL SELECT min(date) FROM cj_settlements WHERE date > ${after}
      UNION ALL SELECT min(date) FROM patti_bills WHERE date > ${after}
      UNION ALL SELECT min(date) FROM opening_payments WHERE date > ${after}
      UNION ALL SELECT min(date) FROM closings WHERE date > ${after}
    ) x`);
  const d = res.rows[0]?.d;
  if (!d) return null;
  const fy = fyOf(d);
  const { end } = fyBounds(fy);
  return { fy, end, canClose: end < today() };
}

// ---------------------------------------------------------------------------------------------
// Snapshot of every live figure the close must not change.

const LOCS: Loc[] = ["MS", "NM"];

type StoreSnapshot = {
  customers: Map<string, number>;
  oldDues: number;
  pattiUnpaid: number;
  cash: number;
  bank: number;
  cjHeld: number;
};

type Snapshot = {
  stores: Record<Loc, StoreSnapshot>;
  stock: Map<string, { name: string; main: number; nm: number }>;
};

const FUTURE = "9999-12-31";

async function storeSnapshot(exec: DbExecutor, loc: Loc): Promise<StoreSnapshot> {
  const customers = await getCustomerBalances(loc, exec);
  const dues = await getOldDuesSummary(loc, exec);
  const [patti] = await exec
    .select({ s: sql<string>`coalesce(sum(${schema.pattiBills.net}), 0)` })
    .from(schema.pattiBills)
    .where(
      sql`(${schema.pattiBills.paidMode} IS NULL OR ${schema.pattiBills.paidMode} = '') AND coalesce(${schema.pattiBills.loc}, 'MS') = ${loc}`,
    );
  const cash = await cashBalanceBefore("Cash", FUTURE, loc, exec);
  const bank = await cashBalanceBefore("UPI", FUTURE, loc, exec);
  const cj = await getCjTotals(loc, exec);
  return {
    customers: new Map(customers.map((c) => [c.name, c.balance])),
    oldDues: dues.outstanding,
    pattiUnpaid: Number(patti?.s ?? 0),
    cash,
    bank,
    cjHeld: cj.outstanding,
  };
}

async function snapshot(exec: DbExecutor): Promise<Snapshot> {
  const lots = await getLotsWithStock({ includeDeleted: true }, exec);
  return {
    stores: { MS: await storeSnapshot(exec, "MS"), NM: await storeSnapshot(exec, "NM") },
    stock: new Map(lots.map((l) => [l.id, { name: l.name, main: l.stkM, nm: l.stkN }])),
  };
}

function compareSnapshots(a: Snapshot, b: Snapshot): string[] {
  const diffs: string[] = [];
  const money = (label: string, x: number, y: number) => {
    if (Math.abs(x - y) > 0.005) diffs.push(`${label}: ${r2(x)} → ${r2(y)}`);
  };
  for (const loc of LOCS) {
    const x = a.stores[loc];
    const y = b.stores[loc];
    const store = locLabel(loc);
    for (const name of new Set([...x.customers.keys(), ...y.customers.keys()])) {
      money(`${store} credit for ${name}`, x.customers.get(name) ?? 0, y.customers.get(name) ?? 0);
    }
    money(`${store} old dues outstanding`, x.oldDues, y.oldDues);
    money(`${store} unpaid patti`, x.pattiUnpaid, y.pattiUnpaid);
    money(`${store} cash in hand`, x.cash, y.cash);
    money(`${store} bank / UPI`, x.bank, y.bank);
    money(`${store} CJ money held`, x.cjHeld, y.cjHeld);
  }
  for (const id of new Set([...a.stock.keys(), ...b.stock.keys()])) {
    const x = a.stock.get(id) ?? { name: id, main: 0, nm: 0 };
    const y = b.stock.get(id) ?? { name: x.name, main: 0, nm: 0 };
    if (x.main !== y.main || x.nm !== y.nm) {
      diffs.push(`Stock of ${x.name}: Main ${x.main}/NM ${x.nm} → Main ${y.main}/NM ${y.nm}`);
    }
  }
  return diffs;
}

// ---------------------------------------------------------------------------------------------
// Archive format.

type Bill = typeof schema.bills.$inferSelect;
type BillItem = typeof schema.billItems.$inferSelect;
type Payment = typeof schema.payments.$inferSelect;
type OpeningDue = typeof schema.openingDues.$inferSelect;
type OpeningPayment = typeof schema.openingPayments.$inferSelect;
type PattiBill = typeof schema.pattiBills.$inferSelect;

export type CarryForward = {
  /** Main store's closing. In archives made before the stores were separated: the whole firm's. */
  closing: { date: string; cash: number; bank: number };
  /** New Mahavir's closing. Missing in archives made before the stores were separated. */
  closingNm?: { cash: number; bank: number };
  /** Main store's CJ carry (the whole firm's in older archives). */
  cjMoved: number;
  cjOpening: number;
  cjMovedNm?: number;
  cjOpeningNm?: number;
  stock: { lotId: string; lotName: string; main: number; nm: number }[];
};

export type ArchiveData = {
  /** 1 = made before the stores were separated, 2 = per-store closings and CJ. */
  version: 1 | 2;
  fy: string;
  closedThrough: string;
  closedAt: string;
  removed: {
    bills: Bill[];
    billItems: BillItem[];
    payments: Payment[];
    openingDues: OpeningDue[];
    openingPayments: OpeningPayment[];
    pattiBills: PattiBill[];
    expenses: (typeof schema.expenses.$inferSelect)[];
    hamaliPaid: (typeof schema.hamaliPaid.$inferSelect)[];
    cjSettlements: (typeof schema.cjSettlements.$inferSelect)[];
    stockIn: (typeof schema.stockIn.$inferSelect)[];
    transfers: (typeof schema.transfers.$inferSelect)[];
    closings: (typeof schema.closings.$inferSelect)[];
  };
  /** Rows from this year (or older) that are still owed and stay live, as they stood at close. */
  stillOpen: {
    bills: Bill[];
    billItems: BillItem[];
    payments: Payment[];
    openingDues: OpeningDue[];
    openingPayments: OpeningPayment[];
    pattiBills: PattiBill[];
  };
  reference: {
    lots: (typeof schema.lots.$inferSelect)[];
    lotCosts: (typeof schema.lotCosts.$inferSelect)[];
    gstCustomers: (typeof schema.gstCustomers.$inferSelect)[];
    settings: (typeof schema.settings.$inferSelect)[];
  };
  carryForward: CarryForward;
};

export type CloseResult = {
  fy: string;
  removed: Record<keyof ArchiveData["removed"], number>;
  stillOpen: {
    bills: number;
    billsDue: number;
    oldDues: number;
    oldDuesDue: number;
    patti: number;
    pattiDue: number;
  };
  carry: CarryForward;
  rawBytes: number;
  archiveBytes: number;
};

// ---------------------------------------------------------------------------------------------

const CHUNK = 1000;

async function byChunks<T>(ids: string[], fn: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await fn(ids.slice(i, i + CHUNK))));
  return out;
}

const cents = (v: string | number) => Math.round(Number(v) * 100);

type Removed = ArchiveData["removed"];

const REMOVED_LABELS: Record<keyof Removed, string> = {
  bills: "bills",
  billItems: "bill items",
  payments: "payments",
  openingDues: "old dues",
  openingPayments: "old-due payments",
  pattiBills: "patti bills",
  expenses: "expenses",
  hamaliPaid: "hamali payments",
  cjSettlements: "CJ settlements",
  stockIn: "stock entries",
  transfers: "transfers",
  closings: "day closings",
};

const byKey = <T>(rows: T[], key: (r: T) => string) =>
  rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

/** Fixed row order, so an archive built twice from the same rows is identical. */
function sortRemoved(r: Removed) {
  byKey(r.bills, (x) => x.id);
  byKey(r.billItems, (x) => x.id);
  byKey(r.payments, (x) => x.id);
  byKey(r.openingDues, (x) => x.id);
  byKey(r.openingPayments, (x) => x.id);
  byKey(r.pattiBills, (x) => x.id);
  byKey(r.expenses, (x) => x.id);
  byKey(r.hamaliPaid, (x) => `${x.date}:${x.loc}`);
  byKey(r.cjSettlements, (x) => x.id);
  byKey(r.stockIn, (x) => x.id);
  byKey(r.transfers, (x) => x.id);
  byKey(r.closings, (x) => `${x.date}:${x.loc}`);
}

/** What differs between the archive the owner checked and the rows that would be removed now. */
function diffRemoved(checked: Removed, now: Removed): string[] {
  return (Object.keys(REMOVED_LABELS) as (keyof Removed)[]).flatMap((k) => {
    const a = checked[k] ?? [];
    const b = now[k];
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    const label = REMOVED_LABELS[k];
    return [a.length === b.length ? `${label} edited` : `${label} ${a.length} → ${b.length}`];
  });
}

/** The owner's count on the last day of the year, per store. */
export type StoreCounts = Record<Loc, { cash: number; bank: number }>;

export type CloseInput = { fy: string; counts: StoreCounts; userId: string };

type Mode = { kind: "dry-run" } | { kind: "remove"; checked: Removed };

type Built = {
  result: CloseResult;
  archive: {
    counts: { removed: CloseResult["removed"]; stillOpen: CloseResult["stillOpen"] };
    summary: { closedThrough: string; carry: CarryForward };
    rawBytes: number;
    data: Buffer;
  };
};

export async function runYearClose(tx: DbExecutor, input: CloseInput, mode: Mode): Promise<Built> {
  const { fy, counts, userId } = input;
  if (!FY_RE.test(fy)) throw new Error("Invalid financial year.");
  const { end, nextStart } = fyBounds(fy);
  if (end >= today()) throw new Error(`${fy} has not ended yet. It can be closed after ${end}.`);

  // Hold off writes (reads keep working) so the before/after check sees a still picture.
  await tx.execute(sql`SET LOCAL lock_timeout = '15s'`);
  await tx.execute(sql`
    LOCK TABLE bills, bill_items, payments, opening_dues, opening_payments, patti_bills, expenses,
      hamali_paid, cj_settlements, stock_in, transfers, closings, settings, lots, fy_archives
    IN EXCLUSIVE MODE`);

  const latest = await latestArchive(tx);
  if (mode.kind === "remove") {
    if (latest?.fy !== fy || latest.status !== "pending") {
      throw new Error(`There is no ${fy} archive waiting for a check.`);
    }
  } else {
    if (latest?.status === "pending") {
      throw new Error(`The ${latest.fy} archive is waiting for a check. Confirm or discard it first.`);
    }
    if (latest && fy <= latest.fy) throw new Error(`${fy} is already closed.`);
  }

  // 1. The owner's count on the last day anchors every later cash/bank balance, per store.
  for (const loc of LOCS) {
    const { cash, bank } = counts[loc];
    await tx
      .insert(schema.closings)
      .values({ date: end, loc, cash: cash.toString(), bank: bank.toString(), createdBy: userId })
      .onConflictDoUpdate({
        target: [schema.closings.date, schema.closings.loc],
        set: { cash: cash.toString(), bank: bank.toString() },
      });
  }

  const before = await snapshot(tx);

  // 2. Settled rows to remove. A bill/old due goes only when its balance is exactly zero and every
  //    payment on it is dated inside the closed period (later payments belong to later cash).
  const billIds = (
    await tx.execute<{ id: string }>(sql`
      SELECT b.id FROM bills b LEFT JOIN payments p ON p.bill_id = b.id
      WHERE b.fy <= ${fy} AND b.date <= ${end}
      GROUP BY b.id
      HAVING b.total - coalesce(sum(p.amount), 0) = 0
         AND coalesce(max(p.date), b.date) <= ${end}`)
  ).rows.map((r) => r.id);
  const dueIds = (
    await tx.execute<{ id: string }>(sql`
      SELECT d.id FROM opening_dues d LEFT JOIN opening_payments p ON p.opening_due_id = d.id
      WHERE d.date <= ${end}
      GROUP BY d.id
      HAVING d.amount - coalesce(sum(p.amount), 0) = 0
         AND coalesce(max(p.date), d.date) <= ${end}`)
  ).rows.map((r) => r.id);
  const pattiIds = (
    await tx.execute<{ id: string }>(sql`
      SELECT id FROM patti_bills
      WHERE fy <= ${fy} AND date <= ${end} AND coalesce(paid_mode, '') <> ''
        AND (paid_date IS NULL OR paid_date <= ${end})`)
  ).rows.map((r) => r.id);

  const expensesInPeriod = tx
    .select({ id: schema.expenses.id })
    .from(schema.expenses)
    .where(lte(schema.expenses.date, end));

  const removed: ArchiveData["removed"] = {
    bills: await byChunks(billIds, (c) =>
      tx.select().from(schema.bills).where(inArray(schema.bills.id, c)),
    ),
    billItems: await byChunks(billIds, (c) =>
      tx.select().from(schema.billItems).where(inArray(schema.billItems.billId, c)),
    ),
    payments: await byChunks(billIds, (c) =>
      tx.select().from(schema.payments).where(inArray(schema.payments.billId, c)),
    ),
    openingDues: await byChunks(dueIds, (c) =>
      tx.select().from(schema.openingDues).where(inArray(schema.openingDues.id, c)),
    ),
    openingPayments: await byChunks(dueIds, (c) =>
      tx
        .select()
        .from(schema.openingPayments)
        .where(inArray(schema.openingPayments.openingDueId, c)),
    ),
    pattiBills: await byChunks(pattiIds, (c) =>
      tx.select().from(schema.pattiBills).where(inArray(schema.pattiBills.id, c)),
    ),
    expenses: await tx.select().from(schema.expenses).where(lte(schema.expenses.date, end)),
    hamaliPaid: await tx
      .select()
      .from(schema.hamaliPaid)
      .where(inArray(schema.hamaliPaid.expenseId, expensesInPeriod)),
    cjSettlements: await tx
      .select()
      .from(schema.cjSettlements)
      .where(lte(schema.cjSettlements.date, end)),
    stockIn: await tx.select().from(schema.stockIn).where(lte(schema.stockIn.date, end)),
    transfers: await tx.select().from(schema.transfers).where(lte(schema.transfers.date, end)),
    // The closings on the last day stay: they are each store's cash/bank anchor from now on.
    closings: await tx.select().from(schema.closings).where(lt(schema.closings.date, end)),
  };
  sortRemoved(removed);

  // Only rows the owner has seen in the archive may be removed.
  if (mode.kind === "remove") {
    const changed = diffRemoved(mode.checked, removed);
    if (changed.length) {
      throw new Error(
        `Records for ${fy} changed after the archive was made (${changed.join(", ")}). Nothing was removed. Discard the archive, create it again and check it again.`,
      );
    }
  }

  // Still-owed rows of this year (and older) stay live; keep a copy so the archive is the full year.
  const removedBills = new Set(billIds);
  const removedDues = new Set(dueIds);
  const removedPatti = new Set(pattiIds);
  const openBills = (
    await tx.select().from(schema.bills).where(sql`${schema.bills.fy} <= ${fy}`)
  ).filter((b) => !removedBills.has(b.id));
  const openBillIds = openBills.map((b) => b.id);
  const openDues = (
    await tx.select().from(schema.openingDues).where(lte(schema.openingDues.date, end))
  ).filter((d) => !removedDues.has(d.id));
  const openDueIds = openDues.map((d) => d.id);
  const stillOpen: ArchiveData["stillOpen"] = {
    bills: openBills,
    billItems: await byChunks(openBillIds, (c) =>
      tx.select().from(schema.billItems).where(inArray(schema.billItems.billId, c)),
    ),
    payments: await byChunks(openBillIds, (c) =>
      tx.select().from(schema.payments).where(inArray(schema.payments.billId, c)),
    ),
    openingDues: openDues,
    openingPayments: await byChunks(openDueIds, (c) =>
      tx
        .select()
        .from(schema.openingPayments)
        .where(inArray(schema.openingPayments.openingDueId, c)),
    ),
    pattiBills: (
      await tx.select().from(schema.pattiBills).where(sql`${schema.pattiBills.fy} <= ${fy}`)
    ).filter((p) => !removedPatti.has(p.id)),
  };

  const reference: ArchiveData["reference"] = {
    lots: await tx.select().from(schema.lots),
    lotCosts: await tx.select().from(schema.lotCosts),
    gstCustomers: await tx.select().from(schema.gstCustomers),
    settings: await tx.select().from(schema.settings),
  };

  // 3. Carry forward what the removed rows contributed to running totals. CJ is per store: a
  //    receipt belongs to its bill's store, a settlement to its own.
  const billLoc = new Map(removed.bills.map((b) => [b.id, b.loc]));
  const atStore = (v: string | null | undefined, loc: Loc) => (v === "NM" ? "NM" : "MS") === loc;
  const cjMovedFor = (loc: Loc) =>
    removed.payments
      .filter((p) => p.mode === "CJ" && atStore(billLoc.get(p.billId), loc))
      .reduce((s, p) => s + cents(p.amount), 0) -
    removed.cjSettlements.filter((c) => atStore(c.loc, loc)).reduce((s, c) => s + cents(c.amount), 0);
  const cjMovedCents = cjMovedFor("MS");
  const cjMovedNmCents = cjMovedFor("NM");
  const cjOpening = cents(reference.settings[0]?.cjOpening ?? 0) + cjMovedCents;
  const cjOpeningNm = cents(reference.settings[0]?.cjOpeningNm ?? 0) + cjMovedNmCents;

  // Stock (mirrors getLotsWithStock): Main = in − out + back − sold at Main; NM = out − back − sold at NM.
  const delta = new Map<string, { main: number; nm: number }>();
  const bump = (lotId: string, main: number, nm: number) => {
    const d = delta.get(lotId) ?? { main: 0, nm: 0 };
    delta.set(lotId, { main: d.main + main, nm: d.nm + nm });
  };
  for (const s of removed.stockIn) {
    if (s.loc === "NM") bump(s.lotId, 0, s.bags);
    else bump(s.lotId, s.bags, 0);
  }
  for (const t of removed.transfers) {
    if (t.dir === "out") bump(t.lotId, -t.bags, t.bags);
    else bump(t.lotId, t.bags, -t.bags);
  }
  for (const i of removed.billItems) {
    if (billLoc.get(i.billId) === "NM") bump(i.lotId, 0, -i.bags);
    else bump(i.lotId, -i.bags, 0);
  }
  const lotName = new Map(reference.lots.map((l) => [l.id, l.name]));
  const stockCarry = [...delta.entries()]
    .filter(([, d]) => d.main !== 0 || d.nm !== 0)
    .map(([lotId, d]) => ({ lotId, lotName: lotName.get(lotId) ?? "", main: d.main, nm: d.nm }));

  const carry: CarryForward = {
    closing: { date: end, cash: counts.MS.cash, bank: counts.MS.bank },
    closingNm: { cash: counts.NM.cash, bank: counts.NM.bank },
    cjMoved: cjMovedCents / 100,
    cjOpening: cjOpening / 100,
    cjMovedNm: cjMovedNmCents / 100,
    cjOpeningNm: cjOpeningNm / 100,
    stock: stockCarry,
  };

  // 4. Build the archive. On removal the pending row becomes the final archive in the same
  //    transaction, so it is only marked closed if the whole close succeeds.
  const data: ArchiveData = {
    version: 2,
    fy,
    closedThrough: end,
    closedAt: new Date().toISOString(),
    removed,
    stillOpen,
    reference,
    carryForward: carry,
  };
  const raw = Buffer.from(JSON.stringify(data));
  const gz = gzipSync(raw, { level: 9 });
  const removedCounts = Object.fromEntries(
    Object.entries(removed).map(([k, v]) => [k, v.length]),
  ) as CloseResult["removed"];
  const sumDue = <T>(rows: T[], total: (r: T) => number, paid: (r: T) => number) =>
    rows.reduce((s, r) => s + total(r) - paid(r), 0) / 100;
  const paidOn = (pays: { amount: string }[]) => pays.reduce((s, p) => s + cents(p.amount), 0);
  const stillOpenSummary: CloseResult["stillOpen"] = {
    bills: stillOpen.bills.length,
    billsDue: sumDue(
      stillOpen.bills,
      (b) => cents(b.total),
      (b) => paidOn(stillOpen.payments.filter((p) => p.billId === b.id)),
    ),
    oldDues: stillOpen.openingDues.length,
    oldDuesDue: sumDue(
      stillOpen.openingDues,
      (d) => cents(d.amount),
      (d) => paidOn(stillOpen.openingPayments.filter((p) => p.openingDueId === d.id)),
    ),
    patti: stillOpen.pattiBills.filter((p) => !p.paidMode).length,
    pattiDue: sumDue(
      stillOpen.pattiBills.filter((p) => !p.paidMode),
      (p) => cents(p.net),
      () => 0,
    ),
  };
  const archive: Built["archive"] = {
    counts: { removed: removedCounts, stillOpen: stillOpenSummary },
    summary: { closedThrough: end, carry },
    rawBytes: raw.length,
    data: gz,
  };
  if (mode.kind === "remove") {
    await tx
      .update(schema.fyArchives)
      .set({ ...archive, status: "closed", removedAt: new Date(), removedBy: userId })
      .where(and(eq(schema.fyArchives.fy, fy), eq(schema.fyArchives.status, "pending")));
  }

  // 5. Remove settled rows. Cascades: bills → items + payments, old dues → their payments,
  //    expenses → hamali_paid.
  await byChunks(billIds, async (c) => {
    await tx.delete(schema.bills).where(inArray(schema.bills.id, c));
    return [];
  });
  await byChunks(dueIds, async (c) => {
    await tx.delete(schema.openingDues).where(inArray(schema.openingDues.id, c));
    return [];
  });
  await byChunks(pattiIds, async (c) => {
    await tx.delete(schema.pattiBills).where(inArray(schema.pattiBills.id, c));
    return [];
  });
  await tx.delete(schema.expenses).where(lte(schema.expenses.date, end));
  await tx.delete(schema.cjSettlements).where(lte(schema.cjSettlements.date, end));
  await tx.delete(schema.stockIn).where(lte(schema.stockIn.date, end));
  await tx.delete(schema.transfers).where(lte(schema.transfers.date, end));
  await tx.delete(schema.closings).where(lt(schema.closings.date, end));

  // 6. Carry-forward rows, dated the first day of the next year. stock_in adds the whole lot to
  //    Main; a transfer then moves the New Mahavir share across.
  const stockRows = stockCarry
    .filter((s) => s.main + s.nm !== 0)
    .map((s) => ({ lotId: s.lotId, bags: s.main + s.nm, date: nextStart, createdBy: userId }));
  const transferRows = stockCarry
    .filter((s) => s.nm !== 0)
    .map((s) => ({
      lotId: s.lotId,
      lotNameSnapshot: s.lotName,
      bags: Math.abs(s.nm),
      dir: s.nm > 0 ? ("out" as const) : ("back" as const),
      date: nextStart,
      note: `Opening stock carried from ${fy}`,
      createdBy: userId,
    }));
  if (stockRows.length) await tx.insert(schema.stockIn).values(stockRows);
  if (transferRows.length) await tx.insert(schema.transfers).values(transferRows);
  if (cjMovedCents !== 0 || cjMovedNmCents !== 0) {
    const cj = {
      cjOpening: (cjOpening / 100).toString(),
      cjOpeningNm: (cjOpeningNm / 100).toString(),
    };
    await tx
      .insert(schema.settings)
      .values({ id: 1, ...cj })
      .onConflictDoUpdate({
        target: schema.settings.id,
        set: { ...cj, updatedAt: new Date() },
      });
  }

  // 7. Every live figure must be exactly as before, or nothing is saved.
  const after = await snapshot(tx);
  const diffs = compareSnapshots(before, after);
  if (diffs.length) {
    throw new Error(`Year close stopped, nothing was changed. Figures that would move: ${diffs.join("; ")}`);
  }

  return {
    result: {
      fy,
      removed: removedCounts,
      stillOpen: stillOpenSummary,
      carry,
      rawBytes: raw.length,
      archiveBytes: gz.length,
    },
    archive,
  };
}

class DryRunRollback extends Error {
  constructor(readonly built: Built) {
    super("dry run");
  }
}

/** Runs the whole close, including the safety check, and always rolls it back. */
async function dryRun(input: CloseInput): Promise<Built> {
  try {
    await db.transaction(async (tx) => {
      throw new DryRunRollback(await runYearClose(tx, input, { kind: "dry-run" }));
    });
  } catch (e) {
    if (e instanceof DryRunRollback) return e.built;
    throw e;
  }
  throw new Error("Dry run did not run.");
}

export async function previewYearClose(input: CloseInput): Promise<CloseResult> {
  return (await dryRun(input)).result;
}

/** Step 1: save the archive for the owner to check. Nothing is removed; the year is locked. */
export async function createArchive(input: CloseInput): Promise<CloseResult> {
  const built = await dryRun(input);
  await db.insert(schema.fyArchives).values({
    fy: input.fy,
    status: "pending",
    ...built.archive,
    createdBy: input.userId,
  });
  return built.result;
}

/** Step 2: after the owner has checked the archive, remove its rows from the live tables. */
export async function confirmArchive(fy: string, userId: string): Promise<CloseResult> {
  const row = await readArchive(fy);
  if (!row || row.status !== "pending") {
    throw new Error(`There is no ${fy} archive waiting for a check.`);
  }
  const carry = row.data.carryForward;
  if (!carry.closingNm) {
    throw new Error(
      `The ${fy} archive was made before Main store and New Mahavir were separated. Discard it and create it again.`,
    );
  }
  const counts: StoreCounts = {
    MS: { cash: carry.closing.cash, bank: carry.closing.bank },
    NM: carry.closingNm,
  };
  const built = await db.transaction((tx) =>
    runYearClose(tx, { fy, counts, userId }, { kind: "remove", checked: row.data.removed }),
  );
  return built.result;
}

/** Drops an archive that was not confirmed. Nothing was removed, and its year unlocks. */
export async function discardArchive(fy: string): Promise<boolean> {
  const rows = await db
    .delete(schema.fyArchives)
    .where(and(eq(schema.fyArchives.fy, fy), eq(schema.fyArchives.status, "pending")))
    .returning({ fy: schema.fyArchives.fy });
  return rows.length > 0;
}

export async function listArchives() {
  return db
    .select({
      fy: schema.fyArchives.fy,
      status: schema.fyArchives.status,
      counts: schema.fyArchives.counts,
      rawBytes: schema.fyArchives.rawBytes,
      archiveBytes: sql<number>`octet_length(${schema.fyArchives.data})::int`,
      createdAt: schema.fyArchives.createdAt,
      removedAt: schema.fyArchives.removedAt,
    })
    .from(schema.fyArchives)
    .orderBy(desc(schema.fyArchives.fy));
}

export async function readArchive(fy: string) {
  const [row] = await db
    .select({
      status: schema.fyArchives.status,
      createdAt: schema.fyArchives.createdAt,
      removedAt: schema.fyArchives.removedAt,
      data: schema.fyArchives.data,
    })
    .from(schema.fyArchives)
    .where(eq(schema.fyArchives.fy, fy));
  if (!row) return null;
  return {
    ...row,
    data: JSON.parse(gunzipSync(row.data).toString("utf8")) as ArchiveData,
  };
}

/** Every bill in the archive: settled ones (removed) and ones still owed at close (still live). */
export function archiveBills(data: ArchiveData) {
  const rows = [
    ...data.removed.bills.map((b) => ({ b, settled: true })),
    ...data.stillOpen.bills.map((b) => ({ b, settled: false })),
  ];
  const items = [...data.removed.billItems, ...data.stillOpen.billItems];
  const pays = [...data.removed.payments, ...data.stillOpen.payments];
  return rows
    .map(({ b, settled }) => {
      const its = items.filter((i) => i.billId === b.id);
      const paid = pays.filter((p) => p.billId === b.id).reduce((s, p) => s + Number(p.amount), 0);
      return {
        ...b,
        settled,
        lots: Array.from(new Set(its.map((i) => i.lotNameSnapshot))).join(" + "),
        bags: its.reduce((s, i) => s + i.bags, 0),
        kg: its.reduce((s, i) => s + Number(i.kg), 0),
        paid,
        balance: Number(b.total) - paid,
      };
    })
    .sort((a, b) => a.fy.localeCompare(b.fy) || a.kind.localeCompare(b.kind) || a.no - b.no);
}
