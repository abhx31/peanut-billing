"use server";

import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor, requireSession } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";

type Result = { ok: true } | { ok: false; error: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * After a patti_payments row is added or removed, refresh pattiBills'
 * paidMode/paidDate cache: once a bill's payments add up to its net (or
 * more), the cache shows the *latest* payment's mode/date — purely for the
 * existing "Paid · mode · date" badges and prints, which only ever show one
 * mode/date. Below full payment, the cache clears back to "not paid" even if
 * partially paid — the Payments recorded tab is the place to see the real
 * running total.
 */
async function recomputePaidCache(tx: Tx, pattiId: string) {
  const [bill] = await tx
    .select({ net: schema.pattiBills.net })
    .from(schema.pattiBills)
    .where(eq(schema.pattiBills.id, pattiId));
  if (!bill) return;

  const [{ paid } = { paid: "0" }] = await tx
    .select({ paid: sql<string>`coalesce(sum(${schema.pattiPayments.amount}), 0)` })
    .from(schema.pattiPayments)
    .where(eq(schema.pattiPayments.pattiId, pattiId));

  const fullyPaid = Number(paid) + 0.005 >= Number(bill.net) && Number(bill.net) > 0;
  if (fullyPaid) {
    const [latest] = await tx
      .select({ mode: schema.pattiPayments.mode, date: schema.pattiPayments.date })
      .from(schema.pattiPayments)
      .where(eq(schema.pattiPayments.pattiId, pattiId))
      .orderBy(desc(schema.pattiPayments.date), desc(schema.pattiPayments.createdAt))
      .limit(1);
    await tx
      .update(schema.pattiBills)
      .set({ paidMode: latest?.mode ?? null, paidDate: latest?.date ?? null })
      .where(eq(schema.pattiBills.id, pattiId));
  } else {
    await tx
      .update(schema.pattiBills)
      .set({ paidMode: null, paidDate: null })
      .where(eq(schema.pattiBills.id, pattiId));
  }
}

const paySchema = z.object({
  pattiId: z.string().uuid(),
  amount: z.number().positive(),
  mode: z.enum(["Cash", "UPI", "CJ"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(300).optional(),
});

/**
 * Record one payment toward a purchase bill (regular Patti or GST Purchase).
 * Call it as many times as it takes — Cash one day, UPI the next, CJ the day
 * after — each call adds a row rather than overwriting a single flag.
 *
 * A "CJ" payment here means CJ settled that amount straight to the supplier
 * instead of handing it to us — so it reduces the CJ-held balance exactly
 * like a normal CJ settlement, but never touches our own Cash/Bank.
 */
export async function payPattiBill(input: z.input<typeof paySchema>): Promise<Result> {
  const session = await requireSession();
  const parsed = paySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const closed = await closedDateError(parsed.data.date);
  if (closed) return { ok: false, error: closed };

  const bill = await db.query.pattiBills.findFirst({
    where: eq(schema.pattiBills.id, parsed.data.pattiId),
  });
  if (!bill) return { ok: false, error: "Purchase bill not found." };

  await db.transaction(async (tx) => {
    await tx.insert(schema.pattiPayments).values({
      pattiId: parsed.data.pattiId,
      date: parsed.data.date,
      mode: parsed.data.mode,
      amount: parsed.data.amount.toString(),
      note: parsed.data.note || null,
      createdBy: session.user.id,
    });
    await recomputePaidCache(tx, parsed.data.pattiId);
  });

  revalidatePath("/patti");
  revalidatePath("/gstp");
  revalidatePath("/patti-payments");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deletePattiPayment(
  input: z.input<typeof deleteSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid payment." };

  const row = await db.query.pattiPayments.findFirst({
    where: eq(schema.pattiPayments.id, parsed.data.id),
  });
  if (!row) return { ok: false, error: "Payment not found." };
  const closed = await closedDateError(row.date);
  if (closed) return { ok: false, error: closed };

  await db.transaction(async (tx) => {
    await tx.delete(schema.pattiPayments).where(eq(schema.pattiPayments.id, parsed.data.id));
    await recomputePaidCache(tx, row.pattiId);
  });

  revalidatePath("/patti");
  revalidatePath("/gstp");
  revalidatePath("/patti-payments");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}

const updateSchema = paySchema.omit({ pattiId: true }).extend({ id: z.string().uuid() });

/**
 * Correct a recorded purchase payment: amount, mode, date or note. The
 * purchase bill's "fully paid" cache is recomputed afterwards, exactly as when
 * a payment is added or deleted.
 */
export async function updatePattiPayment(
  input: z.input<typeof updateSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const row = await db.query.pattiPayments.findFirst({
    where: eq(schema.pattiPayments.id, parsed.data.id),
  });
  if (!row) return { ok: false, error: "Payment not found." };
  // Both the old and the new date must be in an open financial year.
  if (parsed.data.date !== row.date) {
    const closedOld = await closedDateError(row.date);
    if (closedOld) return { ok: false, error: closedOld };
  }
  const closedNew = await closedDateError(parsed.data.date);
  if (closedNew) return { ok: false, error: closedNew };

  await db.transaction(async (tx) => {
    await tx
      .update(schema.pattiPayments)
      .set({
        amount: parsed.data.amount.toString(),
        mode: parsed.data.mode,
        date: parsed.data.date,
        note: parsed.data.note || null,
      })
      .where(eq(schema.pattiPayments.id, parsed.data.id));
    await recomputePaidCache(tx, row.pattiId);
  });

  revalidatePath("/patti");
  revalidatePath("/gstp");
  revalidatePath("/patti-payments");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}
