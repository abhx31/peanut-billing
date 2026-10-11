import ExcelJS from "exceljs";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  cashBalanceBefore,
  getAllPaymentsOnDate,
  getBillsByDate,
  getCustomerBalances,
  getExpensesByDate,
} from "@/lib/queries";
import { getOldDues } from "@/lib/queries-recv";
import { getPattiBillsByDate } from "@/lib/queries-patti";
import { pad2 } from "@/lib/format";
import type { GstTaxBreakdown, PartySnapshot } from "@/lib/gst-types";

import type { Report } from "@/lib/excel-reports";

// Excel (.xlsx) downloads of the daily pages. Each report mirrors what its page shows;
// "day" puts all of them in one workbook, one sheet each.

export type Viewer = { isOwner: boolean; isPrivileged: boolean };

// Indian digit grouping: 1,23,45,678.00
const MONEY = "[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00";

/** 2026-10-11 → 11-10-2026 */
const dmy = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : "");
const n = (v: string | number | null | undefined) => Number(v ?? 0);
/** Round away float noise (0.1 + 0.2) so cells hold exact rupees/kg. */
const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

type Col = { header: string; key: string; width: number; money?: boolean; decimals?: number };
type Row = Record<string, string | number | null | undefined>;

/** Writes titled blocks (label/value pairs and tables) down a worksheet. */
class SheetWriter {
  private row = 1;
  constructor(private ws: ExcelJS.Worksheet) {}

  private widen(col: number, width: number) {
    const c = this.ws.getColumn(col);
    c.width = Math.max(c.width ?? 10, width);
  }

  title(text: string, sub?: string) {
    const r = this.ws.getRow(this.row++);
    r.getCell(1).value = text;
    r.font = { bold: true, size: 14 };
    if (sub) {
      const s = this.ws.getRow(this.row++);
      s.getCell(1).value = sub;
      s.font = { italic: true, color: { argb: "FF666666" } };
    }
    this.row++;
  }

  section(text: string) {
    const r = this.ws.getRow(this.row++);
    r.getCell(1).value = text;
    r.font = { bold: true, size: 12 };
  }

  pairs(items: [string, number][]) {
    for (const [label, value] of items) {
      const r = this.ws.getRow(this.row++);
      r.getCell(1).value = label;
      r.getCell(2).value = round(value, 2);
      r.getCell(2).numFmt = MONEY;
    }
    this.widen(1, 26);
    this.widen(2, 16);
    this.row++;
  }

  text(t: string) {
    this.ws.getRow(this.row++).getCell(1).value = t;
    this.row++;
  }

  table(cols: Col[], rows: Row[], totals?: Row) {
    const head = this.ws.getRow(this.row++);
    cols.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
      cell.border = { bottom: { style: "thin" } };
      if (c.money || c.decimals !== undefined) cell.alignment = { horizontal: "right" };
      this.widen(i + 1, c.width);
    });
    const write = (data: Row, bold: boolean) => {
      const r = this.ws.getRow(this.row++);
      cols.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        const v = data[c.key];
        cell.value =
          typeof v === "number" ? round(v, c.money ? 2 : (c.decimals ?? 3)) : (v ?? null);
        if (c.money) cell.numFmt = MONEY;
        else if (c.decimals !== undefined) cell.numFmt = c.decimals ? `0.${"0".repeat(c.decimals)}` : "0";
        if (bold) {
          cell.font = { bold: true };
          cell.border = { top: { style: "thin" } };
        }
      });
    };
    if (rows.length === 0) {
      this.ws.getRow(this.row++).getCell(1).value = "Nothing on this date.";
    }
    for (const data of rows) write(data, false);
    if (totals && rows.length) write(totals, true);
    this.row++;
  }
}

const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);

function sheet(wb: ExcelJS.Workbook, name: string) {
  const ws = wb.addWorksheet(name, {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  return new SheetWriter(ws);
}

// ---------------------------------------------------------------------------------------------

async function ledgerSheet(wb: ExcelJS.Workbook, date: string, v: Viewer) {
  const [bills, pays, expenses, openCash, openBank, closing] = await Promise.all([
    getBillsByDate(date, v.isOwner),
    getAllPaymentsOnDate(date),
    getExpensesByDate(date),
    cashBalanceBefore("Cash", date),
    cashBalanceBefore("UPI", date),
    db.query.closings.findFirst({ where: eq(schema.closings.date, date) }),
  ]);
  // Same arithmetic as the Daily ledger page.
  const by = <T extends { mode: string; amount: string }>(rows: T[], mode: string) =>
    sum(rows.filter((r) => r.mode === mode), (r) => n(r.amount));
  const cashIn = by(pays, "Cash");
  const upiIn = by(pays, "UPI");
  const cashOut = by(expenses, "Cash");
  const upiOut = by(expenses, "UPI");
  const sales = sum(bills, (b) => b.total);
  const credit = sum(bills, (b) => b.balance);
  const profit = v.isOwner ? sum(bills, (b) => b.profit ?? 0) : 0;

  const w = sheet(wb, "Daily ledger");
  w.title(`Daily ledger — ${dmy(date)}`);
  w.section("Cash in hand");
  w.pairs([
    ["Opening", openCash],
    ["Cash received", cashIn],
    ["Cash expenses", cashOut],
    ["Closing (book)", openCash + cashIn - cashOut],
    ...(closing?.cash != null ? ([["Closing (counted)", n(closing.cash)]] as [string, number][]) : []),
  ]);
  w.section("Bank / UPI");
  w.pairs([
    ["Opening", openBank],
    ["UPI received", upiIn],
    ["UPI expenses", upiOut],
    ["Closing (book)", openBank + upiIn - upiOut],
    ...(closing?.bank != null ? ([["Closing (counted)", n(closing.bank)]] as [string, number][]) : []),
  ]);
  w.section("Day result");
  w.pairs([
    ["Sales (total)", sales],
    ["Balance given (credit)", credit],
    ...(v.isOwner ? ([["Profit on bills", profit]] as [string, number][]) : []),
    ["Expenses", cashOut + upiOut],
    ...(v.isOwner ? ([["Profit after expenses", profit - cashOut - upiOut]] as [string, number][]) : []),
  ]);

  w.section("Sales");
  w.table(
    [
      { header: "Bill no.", key: "no", width: 10 },
      { header: "Customer", key: "customer", width: 26 },
      { header: "Lot", key: "lot", width: 22 },
      { header: "Bags", key: "bags", width: 8, decimals: 0 },
      { header: "Kg", key: "kg", width: 10, decimals: 2 },
      { header: "Total", key: "total", width: 14, money: true },
      { header: "Paid", key: "paid", width: 14, money: true },
      { header: "Balance", key: "balance", width: 14, money: true },
      ...(v.isOwner ? [{ header: "Profit", key: "profit", width: 14, money: true }] : []),
    ],
    bills.map((b) => ({
      no: pad2(b.no),
      customer: b.customer,
      lot: b.items.map((i) => i.lotName).join(" + "),
      bags: b.bags,
      kg: b.kg,
      total: b.total,
      paid: b.paid,
      balance: b.balance,
      profit: b.profit,
    })),
    {
      no: "Total",
      bags: sum(bills, (b) => b.bags),
      kg: sum(bills, (b) => b.kg),
      total: sales,
      paid: sum(bills, (b) => b.paid),
      balance: credit,
      profit: v.isOwner ? profit : undefined,
    },
  );

  w.section("Money received");
  w.table(
    [
      { header: "Bill no.", key: "no", width: 10 },
      { header: "Customer", key: "customer", width: 26 },
      { header: "Mode", key: "mode", width: 10 },
      { header: "Amount", key: "amount", width: 14, money: true },
    ],
    pays.map((p) => ({ no: pad2(p.billNo), customer: p.customer, mode: p.mode, amount: n(p.amount) })),
    { no: "Total", amount: sum(pays, (p) => n(p.amount)) },
  );

  w.section("Expenses");
  expenseTable(w, expenses);
}

function expenseTable(w: SheetWriter, rows: Awaited<ReturnType<typeof getExpensesByDate>>) {
  w.table(
    [
      { header: "Category", key: "category", width: 18 },
      { header: "Note", key: "note", width: 30 },
      { header: "Paid by", key: "mode", width: 10 },
      { header: "Store", key: "store", width: 14 },
      { header: "Amount", key: "amount", width: 14, money: true },
    ],
    rows.map((e) => ({
      category: e.category,
      note: e.note ?? "",
      mode: e.mode,
      store: e.loc === "NM" ? "New Mahavir" : "Main",
      amount: n(e.amount),
    })),
    { category: "Total", amount: sum(rows, (e) => n(e.amount)) },
  );
}

async function expensesSheet(wb: ExcelJS.Workbook, date: string) {
  const rows = await getExpensesByDate(date);
  const w = sheet(wb, "Expenses");
  w.title(`Expenses — ${dmy(date)}`);
  expenseTable(w, rows);
  const total = (mode: string) => sum(rows.filter((e) => e.mode === mode), (e) => n(e.amount));
  w.pairs([
    ["Paid in cash", total("Cash")],
    ["Paid by UPI", total("UPI")],
    ...(total("CJ") ? ([["Paid via CJ", total("CJ")]] as [string, number][]) : []),
    ["Total", sum(rows, (e) => n(e.amount))],
  ]);
}

async function receivablesSheet(wb: ExcelJS.Workbook, date: string) {
  const dues = await getOldDues();
  const w = sheet(wb, "Receivables");
  w.title("Receivables — old dues", `As on ${dmy(date)}`);
  w.table(
    [
      { header: "Customer", key: "customer", width: 26 },
      { header: "As of", key: "date", width: 12 },
      { header: "Old due", key: "amount", width: 14, money: true },
      { header: "Received", key: "paid", width: 14, money: true },
      { header: "Still due", key: "due", width: 14, money: true },
      { header: "Note", key: "note", width: 30 },
    ],
    dues.map((d) => ({
      customer: d.customer,
      date: dmy(d.date),
      amount: d.amount,
      paid: d.paid,
      due: d.due,
      note: d.note ?? "",
    })),
    {
      customer: "Total",
      amount: sum(dues, (d) => d.amount),
      paid: sum(dues, (d) => d.paid),
      due: sum(dues, (d) => d.due),
    },
  );
}

async function balancesSheet(wb: ExcelJS.Workbook, date: string) {
  const all = await getCustomerBalances();
  const w = sheet(wb, "Balances");
  w.title("Customer balances (credit given)", `As on ${dmy(date)}`);
  w.table(
    [
      { header: "Customer", key: "name", width: 28 },
      { header: "Total billed", key: "billed", width: 16, money: true },
      { header: "Paid", key: "paid", width: 16, money: true },
      { header: "Balance", key: "balance", width: 16, money: true },
    ],
    all,
    {
      name: "All customers",
      billed: sum(all, (c) => c.billed),
      paid: sum(all, (c) => c.paid),
      balance: sum(all, (c) => c.balance),
    },
  );
}

async function gstSheet(wb: ExcelJS.Workbook, date: string) {
  const bills = await db
    .select()
    .from(schema.bills)
    .where(and(eq(schema.bills.kind, "gst"), eq(schema.bills.date, date)))
    .orderBy(asc(schema.bills.no));
  const paid = bills.length
    ? await db
        .select({
          billId: schema.payments.billId,
          s: sql<string>`coalesce(sum(${schema.payments.amount}), 0)`,
        })
        .from(schema.payments)
        .where(
          inArray(
            schema.payments.billId,
            bills.map((b) => b.id),
          ),
        )
        .groupBy(schema.payments.billId)
    : [];
  const paidMap = new Map(paid.map((p) => [p.billId, n(p.s)]));

  const rows = bills.map((b) => {
    const buyer = (b.buyerSnapshot ?? {}) as Partial<PartySnapshot>;
    const tax = b.taxBreakdown as GstTaxBreakdown | null;
    const total = n(b.total);
    const p = paidMap.get(b.id) ?? 0;
    return {
      no: pad2(b.no),
      buyer: buyer.name ?? b.customer,
      gstin: buyer.gstin ?? "",
      state: [buyer.state, buyer.stateCode].filter(Boolean).join(" / "),
      taxable: tax?.taxable ?? n(b.amount),
      pct: n(b.gstPercent),
      cgst: tax?.cgst ?? 0,
      sgst: tax?.sgst ?? 0,
      igst: tax?.igst ?? 0,
      ro: tax?.roundOff ?? 0,
      total,
      paid: p,
      balance: total - p,
    };
  });

  const w = sheet(wb, "GST bills");
  w.title(`GST invoices — ${dmy(date)}`);
  w.table(
    [
      { header: "Invoice no.", key: "no", width: 11 },
      { header: "Buyer", key: "buyer", width: 26 },
      { header: "Buyer GSTIN", key: "gstin", width: 18 },
      { header: "State / code", key: "state", width: 16 },
      { header: "Taxable value", key: "taxable", width: 15, money: true },
      { header: "GST %", key: "pct", width: 8, decimals: 2 },
      { header: "CGST", key: "cgst", width: 12, money: true },
      { header: "SGST", key: "sgst", width: 12, money: true },
      { header: "IGST", key: "igst", width: 12, money: true },
      { header: "Round off", key: "ro", width: 10, money: true },
      { header: "Invoice total", key: "total", width: 15, money: true },
      { header: "Paid", key: "paid", width: 14, money: true },
      { header: "Balance", key: "balance", width: 14, money: true },
    ],
    rows,
    {
      no: "Total",
      taxable: sum(rows, (r) => r.taxable),
      cgst: sum(rows, (r) => r.cgst),
      sgst: sum(rows, (r) => r.sgst),
      igst: sum(rows, (r) => r.igst),
      ro: sum(rows, (r) => r.ro),
      total: sum(rows, (r) => r.total),
      paid: sum(rows, (r) => r.paid),
      balance: sum(rows, (r) => r.balance),
    },
  );
}

async function pattiSheet(wb: ExcelJS.Workbook, date: string) {
  const bills = (await getPattiBillsByDate(date)).sort((a, b) => a.no - b.no);
  const w = sheet(wb, "Patti bills");
  w.title(`Patti bills (purchases) — ${dmy(date)}`);
  w.table(
    [
      { header: "No.", key: "no", width: 7 },
      { header: "Seller", key: "party", width: 24 },
      { header: "Lot", key: "lot", width: 18 },
      { header: "Bags", key: "bags", width: 8, decimals: 0 },
      { header: "Kg", key: "kg", width: 10, decimals: 2 },
      { header: "Rate", key: "rate", width: 11, money: true },
      { header: "Amount", key: "amount", width: 14, money: true },
      { header: "CD", key: "cd", width: 11, money: true },
      { header: "Labour", key: "labor", width: 11, money: true },
      { header: "Brokerage", key: "broker", width: 11, money: true },
      { header: "Transport", key: "transport", width: 11, money: true },
      { header: "Net", key: "net", width: 14, money: true },
      { header: "Paid by", key: "paid", width: 10 },
      { header: "Paid on", key: "paidDate", width: 12 },
    ],
    bills.map((b) => ({
      no: pad2(b.no),
      party: b.party,
      lot: b.lotName ?? "",
      bags: b.bags,
      kg: n(b.kg),
      rate: n(b.rate),
      amount: n(b.amount),
      cd: n(b.cd),
      labor: n(b.labor),
      // Brokerage added to the net shows positive, deducted shows negative.
      broker: n(b.broker) * b.brSign,
      transport: n(b.transport),
      net: n(b.net),
      paid: b.paidMode || "Not paid",
      paidDate: dmy(b.paidDate),
    })),
    {
      no: "Total",
      bags: sum(bills, (b) => b.bags),
      kg: sum(bills, (b) => n(b.kg)),
      amount: sum(bills, (b) => n(b.amount)),
      net: sum(bills, (b) => n(b.net)),
    },
  );
  w.pairs([
    ["Total net", sum(bills, (b) => n(b.net))],
    ["Not paid", sum(bills.filter((b) => !b.paidMode), (b) => n(b.net))],
  ]);
}

/** Builds the requested report for `date` as an .xlsx file. */
export async function buildReport(report: Report, date: string, v: Viewer): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Peanut Billing";
  wb.created = new Date();

  if (report === "day" || report === "ledger") await ledgerSheet(wb, date, v);
  if (report === "day" || report === "expenses") await expensesSheet(wb, date);
  if (report === "day" || report === "gst") await gstSheet(wb, date);
  if ((report === "day" && v.isPrivileged) || report === "patti") await pattiSheet(wb, date);
  if (report === "day" || report === "receivables") await receivablesSheet(wb, date);
  if (report === "day" || report === "balances") await balancesSheet(wb, date);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
