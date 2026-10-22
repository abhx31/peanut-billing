"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth-helpers";
import { getCurrentLoc } from "@/lib/loc";
import { today } from "@/lib/format";
import { customerKey } from "@/lib/queries";

const deleteBillSchema = z.object({ id: z.string().uuid() });
const receiveForBillSchema = z.object({
  billId: z.string().uuid(),
  amount: z.number().positive(),
  mode: z.enum(["Cash", "UPI", "CJ"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(300).optional(),
});

type Result = { ok: true } | { ok: false; error: string };

export async function deleteBill(input: z.input<typeof deleteBillSchema>): Promise<Result> {
  await requireSession();
  const parsed = deleteBillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid bill id." };

  await db.delete(schema.bills).where(eq(schema.bills.id, parsed.data.id));
  revalidatePath("/day");
  revalidatePath("/balances");
  revalidatePath("/stock");
  revalidatePath("/ledger");
  revalidatePath("/profit");
  return { ok: true };
}

export async function receivePaymentForBill(
  input: z.input<typeof receiveForBillSchema>,
): Promise<Result> {
  const session = await requireSession();
  const parsed = receiveForBillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid amount." };

  await db.insert(schema.payments).values({
    billId: parsed.data.billId,
    amount: parsed.data.amount.toString(),
    mode: parsed.data.mode,
    date: parsed.data.date ?? today(),
    note: parsed.data.note || null,
    createdBy: session.user.id,
  });
  revalidatePath("/day");
  revalidatePath("/balances");
  revalidatePath("/ledger");
  return { ok: true };
}

const receiveFromCustomerSchema = z.object({
  customer: z.string().trim().min(1),
  amount: z.number().positive(),
  mode: z.enum(["Cash", "UPI", "CJ"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(300).optional(),
});

/**
 * Apply a receipt from a customer against their dues, oldest first:
 *   1. Open opening_dues (by date, then no — oldest first)
 *   2. Unpaid bills (by date, then number)
 *   3. Leftover becomes an "Advance received" opening row with amount=0,
 *      plus an opening_payment linked to it.
 *
 * Mirrors inspiration's `receiveFrom`. CJ settlements are inserted as
 * mode="CJ" so the ledger CJ-to-collect number moves correctly.
 */
export async function receiveFromCustomer(
  input: z.input<typeof receiveFromCustomerSchema>,
): Promise<Result> {
  const session = await requireSession();
  const parsed = receiveFromCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid amount." };

  const { customer, amount, mode, date, note } = parsed.data;
  const payDate = date ?? today();
  const noteVal = note || null;
  const loc = await getCurrentLoc();
  // Every row this cascade inserts shares one id, so the statement can show
  // this as a single "Received ₹X" line instead of its per-bill split.
  const receiptGroupId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    const key = customerKey(customer);
    const nameMatches = sql`lower(regexp_replace(trim(${schema.bills.customer}), '\\s+', ' ', 'g')) = ${key}`;
    const dueNameMatches = sql`lower(regexp_replace(trim(${schema.openingDues.customer}), '\\s+', ' ', 'g')) = ${key}`;

    // 1) Opening dues, oldest first (by date, then creation order).
    const dues = await tx
      .select({
        id: schema.openingDues.id,
        customer: schema.openingDues.customer,
        amount: schema.openingDues.amount,
        date: schema.openingDues.date,
        paid: sql<string>`coalesce((select sum(amount) from opening_payments where opening_due_id = ${schema.openingDues.id}), 0)`,
      })
      .from(schema.openingDues)
      .where(dueNameMatches)
      .orderBy(asc(schema.openingDues.date), asc(schema.openingDues.createdAt));

    let left = amount;
    for (const d of dues) {
      if (left <= 0.005) break;
      const outstanding = Number(d.amount) - Number(d.paid);
      if (outstanding <= 0.005) continue;
      const take = Math.min(outstanding, left);
      await tx.insert(schema.openingPayments).values({
        openingDueId: d.id,
        customer: d.customer,
        loc: loc === "NM" ? "NM" : "MS",
        date: payDate,
        mode,
        amount: take.toString(),
        note: noteVal,
        receiptGroupId,
        createdBy: session.user.id,
      });
      left -= take;
    }

    // 2) Unpaid bills, oldest first.
    const bills = await tx
      .select({
        id: schema.bills.id,
        total: schema.bills.total,
        paid: sql<string>`coalesce((select sum(amount) from payments where bill_id = ${schema.bills.id}), 0)`,
      })
      .from(schema.bills)
      .where(nameMatches)
      .orderBy(asc(schema.bills.date), asc(schema.bills.no));

    for (const b of bills) {
      if (left <= 0.005) break;
      const due = Number(b.total) - Number(b.paid);
      if (due <= 0.005) continue;
      const take = Math.min(due, left);
      await tx.insert(schema.payments).values({
        billId: b.id,
        amount: take.toString(),
        mode,
        date: payDate,
        note: noteVal,
        receiptGroupId,
        createdBy: session.user.id,
      });
      left -= take;
    }

    // 3) Advance received — the customer paid more than they owed. Record it
    //    as an opening row with amount=0 and an opening_payment with the
    //    leftover; the customer's balance becomes negative (= money we owe
    //    them / they prepaid).
    if (left > 0.005) {
      const displayName =
        dues[0]?.customer ??
        bills.length > 0
          ? (
              await tx
                .select({ c: schema.bills.customer })
                .from(schema.bills)
                .where(nameMatches)
                .limit(1)
            )[0]?.c
          : customer;
      const [advance] = await tx
        .insert(schema.openingDues)
        .values({
          customer: displayName ?? customer,
          amount: "0",
          date: payDate,
          note: "Advance received",
          createdBy: session.user.id,
        })
        .returning({ id: schema.openingDues.id });
      await tx.insert(schema.openingPayments).values({
        openingDueId: advance.id,
        customer: displayName ?? customer,
        loc: loc === "NM" ? "NM" : "MS",
        date: payDate,
        mode,
        amount: left.toString(),
        note: noteVal,
        receiptGroupId,
        createdBy: session.user.id,
      });
    }
  });

  revalidatePath("/day");
  revalidatePath("/balances");
  revalidatePath("/ledger");
  revalidatePath("/recv");
  revalidatePath("/dashboard");
  return { ok: true };
}
