import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  cashBalanceBefore,
  getAllPaymentsOnDate,
  getBillsByDate,
  getCashDepositsOnDate,
  getExpensesByDate,
  getSettings,
} from "@/lib/queries";
import { atLoc, openingsFor, type Loc } from "@/lib/loc";
import { pad2 } from "@/lib/format";

// One store's Daily ledger for one date: the itemised Cash, Bank/UPI and CJ
// accounts (every receipt and payment on its own line, named by who paid or
// who was paid) plus the day's raw lists. Shared by the ledger page and its
// print so both always show the same book.

export type LedgerLine = { label: string; amount: number };
export type LedgerAccount = { debits: LedgerLine[]; credits: LedgerLine[]; closing: number };

type Mode = "Cash" | "UPI" | "CJ";

function billLabel(kind: string, no: number) {
  if (kind === "gst") return `GST bill ${pad2(no)}`;
  if (kind === "psale") return `Sale patti ${pad2(no)}`;
  return `Bill ${pad2(no)}`;
}

function pattiLabel(kind: string | null, no: number) {
  return kind === "gstp" ? `GST purchase ${pad2(no)}` : `Patti ${pad2(no)}`;
}

/** "Category — note", or just the category. */
function withNote(text: string, note: string | null | undefined) {
  return note?.trim() ? `${text} — ${note.trim()}` : text;
}

export async function getLedgerDay(date: string, loc: Loc, isOwner: boolean) {
  const [
    bills,
    pays,
    expenses,
    settings,
    openCash,
    openBank,
    existingClosing,
    cjSettlementsToday,
    cjSettlementsBeforeRow,
    cjReceivedBeforeRow,
    pattiPaidCJBeforeRow,
    openingPaymentsToday,
    pattiPaidToday,
    depositsToday,
  ] = await Promise.all([
    getBillsByDate(date, isOwner, loc),
    getAllPaymentsOnDate(date, loc),
    getExpensesByDate(date, loc),
    getSettings(),
    cashBalanceBefore("Cash", date, loc),
    cashBalanceBefore("UPI", date, loc),
    db.query.closings.findFirst({
      where: and(eq(schema.closings.date, date), eq(schema.closings.loc, loc)),
    }),
    db
      .select({
        id: schema.cjSettlements.id,
        mode: schema.cjSettlements.mode,
        amount: schema.cjSettlements.amount,
        note: schema.cjSettlements.note,
      })
      .from(schema.cjSettlements)
      .where(and(eq(schema.cjSettlements.date, date), atLoc(schema.cjSettlements.loc, loc)))
      .orderBy(asc(schema.cjSettlements.createdAt)),
    db
      .select({ s: sql<string>`coalesce(sum(${schema.cjSettlements.amount}), 0)` })
      .from(schema.cjSettlements)
      .where(sql`${schema.cjSettlements.date} < ${date} AND ${atLoc(schema.cjSettlements.loc, loc)}`)
      .then((r) => r[0]),
    db
      .select({ s: sql<string>`coalesce(sum(${schema.payments.amount}), 0)` })
      .from(schema.payments)
      .innerJoin(schema.bills, eq(schema.bills.id, schema.payments.billId))
      .where(
        sql`${schema.payments.mode} = 'CJ' AND ${schema.payments.date} < ${date} AND ${atLoc(schema.bills.loc, loc)}`,
      )
      .then((r) => r[0]),
    db
      .select({ s: sql<string>`coalesce(sum(${schema.pattiPayments.amount}), 0)` })
      .from(schema.pattiPayments)
      .innerJoin(schema.pattiBills, eq(schema.pattiBills.id, schema.pattiPayments.pattiId))
      .where(
        sql`${schema.pattiPayments.mode} = 'CJ' AND ${schema.pattiPayments.date} < ${date} AND ${atLoc(schema.pattiBills.loc, loc)}`,
      )
      .then((r) => r[0]),
    db
      .select({
        id: schema.openingPayments.id,
        customer: schema.openingPayments.customer,
        mode: schema.openingPayments.mode,
        amount: schema.openingPayments.amount,
        loc: schema.openingPayments.loc,
        note: schema.openingPayments.note,
        dueNote: schema.openingDues.note,
        dueAmount: schema.openingDues.amount,
      })
      .from(schema.openingPayments)
      .leftJoin(
        schema.openingDues,
        eq(schema.openingDues.id, schema.openingPayments.openingDueId),
      )
      .where(
        and(eq(schema.openingPayments.date, date), atLoc(schema.openingPayments.loc, loc)),
      )
      .orderBy(asc(schema.openingPayments.createdAt)),
    // Fetched for everyone so the Cash/Bank/CJ balances stay correct; who got
    // paid is only shown to the owner (see `purchaseLines` below).
    db
      .select({
        id: schema.pattiPayments.id,
        pattiNo: schema.pattiBills.no,
        pattiKind: schema.pattiBills.kind,
        party: schema.pattiBills.party,
        mode: schema.pattiPayments.mode,
        amount: schema.pattiPayments.amount,
      })
      .from(schema.pattiPayments)
      .innerJoin(schema.pattiBills, eq(schema.pattiBills.id, schema.pattiPayments.pattiId))
      .where(and(eq(schema.pattiPayments.date, date), atLoc(schema.pattiBills.loc, loc)))
      .orderBy(schema.pattiBills.no),
    getCashDepositsOnDate(date, loc),
  ]);

  const openingPayments = openingPaymentsToday.map((p) => ({
    ...p,
    // Opening-payments cover two cases: a real receipt against a pre-app old
    // due, or an overpayment parked on an amount=0 "Advance received" marker.
    isAdvance:
      Number(p.dueAmount ?? 0) === 0 || (p.dueNote ?? "").toLowerCase().includes("advance"),
  }));

  // Money received from customers in one mode, one line per receipt.
  const receiptLines = (mode: Mode, verb: (customer: string) => string): LedgerLine[] => [
    ...pays
      .filter((p) => p.mode === mode)
      .map((p) => ({
        label: withNote(`${verb(p.customer)} (${billLabel(p.billKind, p.billNo)})`, p.note),
        amount: Number(p.amount),
      })),
    ...openingPayments
      .filter((p) => p.mode === mode)
      .map((p) => ({
        label: withNote(`${verb(p.customer)} (${p.isAdvance ? "advance" : "old due"})`, p.note),
        amount: Number(p.amount),
      })),
  ];

  const expenseLines = (mode: "Cash" | "UPI"): LedgerLine[] =>
    expenses
      .filter((e) => e.mode === mode)
      .map((e) => ({ label: withNote(`By ${e.category}`, e.note), amount: Number(e.amount) }));

  // Purchase payments: one line per supplier for the owner; everyone else
  // sees a single total so the account still balances.
  const purchaseLines = (mode: Mode, verb: string): LedgerLine[] => {
    const rows = pattiPaidToday.filter((p) => p.mode === mode);
    if (rows.length === 0) return [];
    if (!isOwner) {
      return [{ label: `${verb} suppliers (purchases)`, amount: rows.reduce((s, p) => s + Number(p.amount), 0) }];
    }
    return rows.map((p) => ({
      label: `${verb} ${p.party} (${pattiLabel(p.pattiKind, p.pattiNo)})`,
      amount: Number(p.amount),
    }));
  };

  const cjSettledLines = (mode: "Cash" | "UPI"): LedgerLine[] =>
    cjSettlementsToday
      .filter((x) => x.mode === mode)
      .map((x) => ({
        label: withNote(`To ${mode === "Cash" ? "Cash" : "UPI"} from CJ (settlement)`, x.note),
        amount: Number(x.amount),
      }));

  const sum = (lines: LedgerLine[]) => lines.reduce((s, l) => s + l.amount, 0);
  const account = (opening: number, inLines: LedgerLine[], outLines: LedgerLine[]): LedgerAccount => {
    const closing = opening + sum(inLines) - sum(outLines);
    return {
      debits: [{ label: "To Opening balance b/d", amount: opening }, ...inLines],
      credits: [...outLines, { label: "By Closing balance c/d", amount: closing }],
      closing,
    };
  };

  const cash = account(
    openCash,
    [...receiptLines("Cash", (c) => `To Cash from ${c}`), ...cjSettledLines("Cash")],
    [
      ...expenseLines("Cash"),
      ...purchaseLines("Cash", "By Paid to"),
      ...depositsToday.map((d) => ({
        label: withNote("By Deposited to bank", d.note),
        amount: Number(d.amount),
      })),
    ],
  );

  const bank = account(
    openBank,
    [
      ...receiptLines("UPI", (c) => `To UPI from ${c}`),
      ...cjSettledLines("UPI"),
      ...depositsToday.map((d) => ({
        label: withNote("To Cash deposited", d.note),
        amount: Number(d.amount),
      })),
    ],
    [...expenseLines("UPI"), ...purchaseLines("UPI", "By Paid to")],
  );

  const cjOpening =
    openingsFor(settings, loc).cj +
    Number(cjReceivedBeforeRow?.s ?? 0) -
    Number(cjSettlementsBeforeRow?.s ?? 0) -
    Number(pattiPaidCJBeforeRow?.s ?? 0);
  const cj = account(
    cjOpening,
    receiptLines("CJ", (c) => `To ${c} paid CJ`),
    [
      ...cjSettlementsToday.map((x) => ({
        label: withNote(`By CJ paid you (${x.mode})`, x.note),
        amount: Number(x.amount),
      })),
      ...purchaseLines("CJ", "By CJ paid"),
    ],
  );

  return {
    settings,
    bills,
    pays,
    expenses,
    openingPayments,
    pattiPaidToday: isOwner ? pattiPaidToday : [],
    depositsToday,
    existingClosing,
    cash,
    bank,
    cj,
  };
}
