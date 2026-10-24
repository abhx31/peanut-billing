"use server";

import { asc, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { fyOf, r2 } from "@/lib/format";
import { atLoc, getCurrentLoc } from "@/lib/loc";
import { customerKey } from "@/lib/queries";

const itemSchema = z.object({
  lotId: z.string().uuid(),
  weightsText: z.string().max(500).optional().default(""),
  bags: z.number().int().positive(),
  kg: z.number().positive(),
  rate: z.number().positive(),
});

const saveBillSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  customer: z.string().trim().min(1).max(120),
  // Optional contact number — never required to generate a bill.
  customerPhone: z.string().trim().max(20).optional().default(""),
  items: z.array(itemSchema).min(1, "Add at least one lot."),
  hamaliPerBag: z.number().min(0),
  gstPercent: z.number().min(0).max(100),
  payCash: z.number().min(0),
  payUpi: z.number().min(0),
  payCj: z.number().min(0).optional().default(0),
});

type Result =
  | { ok: true; billId: string; billNo: number; fy: string }
  | { ok: false; error: string };

export async function saveBill(input: z.input<typeof saveBillSchema>): Promise<Result> {
  const session = await requireSession();
  const parsed = saveBillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;
  const closed = await closedDateError(d.date);
  if (closed) return { ok: false, error: closed };
  const fy = fyOf(d.date);
  const loc = await getCurrentLoc();

  const items = d.items.map((it) => ({
    ...it,
    amount: r2(it.kg * it.rate),
  }));
  const totalBags = items.reduce((s, it) => s + it.bags, 0);
  const totalAmount = r2(items.reduce((s, it) => s + it.amount, 0));
  const hamali = r2(totalBags * d.hamaliPerBag);
  const gst = r2((totalAmount * d.gstPercent) / 100);
  // Round the invoice total to the nearest rupee; the ±paise difference shows
  // on the print as a Round Off line.
  const total = Math.round(totalAmount + hamali + gst);

  const paidNow = r2((d.payCash ?? 0) + (d.payUpi ?? 0) + (d.payCj ?? 0));

  try {
    const result = await db.transaction(async (tx) => {
      const lotIds = Array.from(new Set(items.map((it) => it.lotId)));
      const lots = await tx
        .select()
        .from(schema.lots)
        .where(inArray(schema.lots.id, lotIds));
      const lotMap = new Map(lots.map((l) => [l.id, l]));
      for (const it of items) {
        if (!lotMap.has(it.lotId)) {
          throw new Error("One of the selected lots was not found.");
        }
      }

      // Compute the customer's balance with THIS store BEFORE this bill. Used
      // both for the snapshot stored on the bill and for the overpayment
      // cascade — which never reaches the other store's dues.
      const key = customerKey(d.customer);
      const nameMatches = sql`lower(regexp_replace(trim(${schema.bills.customer}), '\\s+', ' ', 'g')) = ${key} AND ${atLoc(schema.bills.loc, loc)}`;
      const dueNameMatches = sql`lower(regexp_replace(trim(${schema.openingDues.customer}), '\\s+', ' ', 'g')) = ${key} AND ${atLoc(schema.openingDues.loc, loc)}`;
      const [{ s: billsSum } = { s: "0" }] = await tx
        .select({ s: sql<string>`coalesce(sum(${schema.bills.total}), 0)` })
        .from(schema.bills)
        .where(nameMatches);
      const [{ s: paysSum } = { s: "0" }] = await tx
        .select({ s: sql<string>`coalesce(sum(${schema.payments.amount}), 0)` })
        .from(schema.payments)
        .innerJoin(schema.bills, sql`${schema.bills.id} = ${schema.payments.billId} AND ${nameMatches}`);
      const [{ s: duesSum } = { s: "0" }] = await tx
        .select({ s: sql<string>`coalesce(sum(${schema.openingDues.amount}), 0)` })
        .from(schema.openingDues)
        .where(dueNameMatches);
      const [{ s: duePaysSum } = { s: "0" }] = await tx
        .select({ s: sql<string>`coalesce(sum(${schema.openingPayments.amount}), 0)` })
        .from(schema.openingPayments)
        .innerJoin(
          schema.openingDues,
          sql`${schema.openingDues.id} = ${schema.openingPayments.openingDueId} AND ${dueNameMatches}`,
        );
      const prev = r2(
        Number(billsSum ?? 0) +
          Number(duesSum ?? 0) -
          Number(paysSum ?? 0) -
          Number(duePaysSum ?? 0),
      );

      const noResult = await tx.execute<{ no: number }>(
        sql`select next_bill_no_for_loc(${fy}, 'normal', ${loc === "NM" ? "NM" : "MS"}) as no`,
      );
      const no = noResult.rows[0].no;

      const [bill] = await tx
        .insert(schema.bills)
        .values({
          kind: "normal",
          no,
          fy,
          date: d.date,
          customer: d.customer,
          customerPhone: d.customerPhone || null,
          loc: loc === "NM" ? "NM" : "MS",
          hamaliPerBag: d.hamaliPerBag.toString(),
          hamali: hamali.toString(),
          gstPercent: d.gstPercent.toString(),
          gst: gst.toString(),
          amount: totalAmount.toString(),
          total: total.toString(),
          prev: prev.toString(),
          paidNow: paidNow.toString(),
          createdBy: session.user.id,
        })
        .returning({ id: schema.bills.id });

      await tx.insert(schema.billItems).values(
        items.map((it, idx) => ({
          billId: bill.id,
          position: idx,
          lotId: it.lotId,
          lotNameSnapshot: lotMap.get(it.lotId)!.name,
          weightsText: it.weightsText || null,
          bags: it.bags,
          kg: it.kg.toString(),
          rate: it.rate.toString(),
          amount: it.amount.toString(),
        })),
      );

      // Payment split: if the customer pays more than this bill alone, cap the
      // on-bill payments to the bill total and cascade the rest to older dues
      // (oldest first — opening dues, then older bills). Any surplus becomes
      // an "Advance received" opening row.
      const cashIn = d.payCash;
      const upiIn = d.payUpi;
      const cjIn = d.payCj ?? 0;
      let onBillCap = total;
      const cashOnBill = Math.min(cashIn, onBillCap);
      onBillCap -= cashOnBill;
      const upiOnBill = Math.min(upiIn, onBillCap);
      onBillCap -= upiOnBill;
      const cjOnBill = Math.min(cjIn, onBillCap);
      onBillCap -= cjOnBill;
      const cashExtra = r2(cashIn - cashOnBill);
      const upiExtra = r2(upiIn - upiOnBill);
      const cjExtra = r2(cjIn - cjOnBill);

      const payRows: (typeof schema.payments.$inferInsert)[] = [];
      if (cashOnBill > 0) {
        payRows.push({
          billId: bill.id,
          date: d.date,
          mode: "Cash",
          amount: cashOnBill.toString(),
          createdBy: session.user.id,
        });
      }
      if (upiOnBill > 0) {
        payRows.push({
          billId: bill.id,
          date: d.date,
          mode: "UPI",
          amount: upiOnBill.toString(),
          createdBy: session.user.id,
        });
      }
      if (cjOnBill > 0) {
        payRows.push({
          billId: bill.id,
          date: d.date,
          mode: "CJ",
          amount: cjOnBill.toString(),
          createdBy: session.user.id,
        });
      }
      if (payRows.length) await tx.insert(schema.payments).values(payRows);

      // Cascade any mode-level extras to the customer's other debts.
      async function cascade(mode: "Cash" | "UPI" | "CJ", extra: number) {
        if (extra <= 0.005) return;
        // Oldest opening dues first.
        const dues = await tx
          .select({
            id: schema.openingDues.id,
            customer: schema.openingDues.customer,
            amount: schema.openingDues.amount,
            paid: sql<string>`coalesce((select sum(amount) from opening_payments where opening_due_id = ${schema.openingDues.id}), 0)`,
          })
          .from(schema.openingDues)
          .where(dueNameMatches)
          .orderBy(asc(schema.openingDues.date), asc(schema.openingDues.createdAt));
        let left = extra;
        for (const o of dues) {
          if (left <= 0.005) break;
          const outstanding = Number(o.amount) - Number(o.paid);
          if (outstanding <= 0.005) continue;
          const take = Math.min(outstanding, left);
          await tx.insert(schema.openingPayments).values({
            openingDueId: o.id,
            customer: o.customer,
            loc: loc === "NM" ? "NM" : "MS",
            date: d.date,
            mode,
            amount: take.toString(),
            createdBy: session.user.id,
          });
          left -= take;
        }
        // Then older bills (excluding this one).
        if (left > 0.005) {
          const older = await tx
            .select({
              id: schema.bills.id,
              total: schema.bills.total,
              paid: sql<string>`coalesce((select sum(amount) from payments where bill_id = ${schema.bills.id}), 0)`,
            })
            .from(schema.bills)
            .where(sql`${nameMatches} AND ${schema.bills.id} <> ${bill.id}`)
            .orderBy(asc(schema.bills.date), asc(schema.bills.no));
          for (const b of older) {
            if (left <= 0.005) break;
            const due = Number(b.total) - Number(b.paid);
            if (due <= 0.005) continue;
            const take = Math.min(due, left);
            await tx.insert(schema.payments).values({
              billId: b.id,
              date: d.date,
              mode,
              amount: take.toString(),
              createdBy: session.user.id,
            });
            left -= take;
          }
        }
        // Still leftover → record as an advance (opening row amount=0 + payment).
        if (left > 0.005) {
          const [adv] = await tx
            .insert(schema.openingDues)
            .values({
              customer: d.customer,
              amount: "0",
              date: d.date,
              note: "Advance received",
              loc: loc === "NM" ? "NM" : "MS",
              createdBy: session.user.id,
            })
            .returning({ id: schema.openingDues.id });
          await tx.insert(schema.openingPayments).values({
            openingDueId: adv.id,
            customer: d.customer,
            loc: loc === "NM" ? "NM" : "MS",
            date: d.date,
            mode,
            amount: left.toString(),
            createdBy: session.user.id,
          });
        }
      }
      await cascade("Cash", cashExtra);
      await cascade("UPI", upiExtra);
      await cascade("CJ", cjExtra);

      return { billId: bill.id, billNo: no };
    });

    revalidatePath("/bills/new");
    revalidatePath("/lots");
    revalidatePath("/day");
    revalidatePath("/stock");
    revalidatePath("/nm");
    revalidatePath("/cj");
    revalidatePath("/dashboard");
    revalidatePath("/balances");
    revalidatePath("/recv");
    revalidatePath("/ledger");
    return { ok: true, billId: result.billId, billNo: result.billNo, fy };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save the bill.";
    return { ok: false, error: msg };
  }
}
