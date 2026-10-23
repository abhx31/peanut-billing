"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";

const paySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  mode: z.enum(["Cash", "UPI"]),
});

const unpaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Result = { ok: true } | { ok: false; error: string };

function revalidateHamali() {
  revalidatePath("/hamali");
  revalidatePath("/expenses");
  revalidatePath("/ledger");
  revalidatePath("/profit");
  revalidatePath("/dashboard");
}

// Pays loaded (sale-bill) hamali and unloaded (incoming-load) hamali for the
// date together, as one combined expense — the amount submitted is whatever
// the "Hamali for a date" page showed as the combined total at click time.
export async function payHamali(input: z.input<typeof paySchema>): Promise<Result> {
  const session = await requireOwnerOrEditor();
  const parsed = paySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the amount and mode." };
  const closed = await closedDateError(parsed.data.date);
  if (closed) return { ok: false, error: closed };

  // Sum bags on both sides — used only for the note.
  const [billRow] = await db
    .select({ bags: sql<number>`coalesce(sum(${schema.billItems.bags}), 0)::int` })
    .from(schema.billItems)
    .innerJoin(schema.bills, eq(schema.billItems.billId, schema.bills.id))
    .where(sql`${schema.bills.date} = ${parsed.data.date} AND ${schema.bills.hamali}::numeric > 0`);
  const [loadRow] = await db
    .select({ bags: sql<number>`coalesce(sum(${schema.hamaliLoads.bags}), 0)::int` })
    .from(schema.hamaliLoads)
    .where(eq(schema.hamaliLoads.date, parsed.data.date));
  const bags = Number(billRow?.bags ?? 0) + Number(loadRow?.bags ?? 0);

  await db.transaction(async (tx) => {
    // Replace any existing hamali_paid row for this date (one per day).
    const existing = await tx.query.hamaliPaid.findFirst({
      where: eq(schema.hamaliPaid.date, parsed.data.date),
    });
    if (existing) {
      await tx.delete(schema.expenses).where(eq(schema.expenses.id, existing.expenseId));
      await tx
        .delete(schema.hamaliPaid)
        .where(eq(schema.hamaliPaid.date, parsed.data.date));
    }

    const [expense] = await tx
      .insert(schema.expenses)
      .values({
        date: parsed.data.date,
        category: "Hamali",
        note: bags > 0 ? `Hamali for ${bags} bags (loaded + unloaded)` : "Hamali",
        amount: parsed.data.amount.toString(),
        mode: parsed.data.mode,
        isHamali: true,
        createdBy: session.user.id,
      })
      .returning({ id: schema.expenses.id });

    await tx.insert(schema.hamaliPaid).values({
      date: parsed.data.date,
      amount: parsed.data.amount.toString(),
      mode: parsed.data.mode,
      expenseId: expense.id,
      createdBy: session.user.id,
    });
  });

  revalidateHamali();
  return { ok: true };
}

const loadSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bags: z.number().int().positive(),
  ratePerBag: z.number().positive(),
  note: z.string().max(300).optional(),
});

// Just records bags/rate for an incoming load — no payment yet. It's paid
// together with the rest of the day's hamali via payHamali, above.
export async function addHamaliLoad(input: z.input<typeof loadSchema>): Promise<Result> {
  const session = await requireOwnerOrEditor();
  const parsed = loadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const closed = await closedDateError(parsed.data.date);
  if (closed) return { ok: false, error: closed };

  const amount = parsed.data.bags * parsed.data.ratePerBag;

  await db.insert(schema.hamaliLoads).values({
    date: parsed.data.date,
    bags: parsed.data.bags,
    ratePerBag: parsed.data.ratePerBag.toString(),
    amount: amount.toString(),
    note: parsed.data.note || null,
    createdBy: session.user.id,
  });

  revalidateHamali();
  return { ok: true };
}

const updateLoadSchema = loadSchema.extend({ id: z.string().uuid() });

export async function updateHamaliLoad(
  input: z.input<typeof updateLoadSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = updateLoadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const existing = await db.query.hamaliLoads.findFirst({
    where: eq(schema.hamaliLoads.id, parsed.data.id),
  });
  if (!existing) return { ok: false, error: "Hamali load entry not found." };

  if (parsed.data.date !== existing.date) {
    const closedOld = await closedDateError(existing.date);
    if (closedOld) return { ok: false, error: closedOld };
  }
  const closedNew = await closedDateError(parsed.data.date);
  if (closedNew) return { ok: false, error: closedNew };

  const amount = parsed.data.bags * parsed.data.ratePerBag;

  await db
    .update(schema.hamaliLoads)
    .set({
      date: parsed.data.date,
      bags: parsed.data.bags,
      ratePerBag: parsed.data.ratePerBag.toString(),
      amount: amount.toString(),
      note: parsed.data.note || null,
    })
    .where(eq(schema.hamaliLoads.id, parsed.data.id));

  revalidateHamali();
  return { ok: true };
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteHamaliLoad(
  input: z.input<typeof idSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid entry." };

  await db.delete(schema.hamaliLoads).where(eq(schema.hamaliLoads.id, parsed.data.id));

  revalidateHamali();
  return { ok: true };
}

export async function undoHamaliPayment(
  input: z.input<typeof unpaySchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = unpaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid date." };

  const existing = await db.query.hamaliPaid.findFirst({
    where: eq(schema.hamaliPaid.date, parsed.data.date),
  });
  if (!existing) return { ok: true };

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.expenses)
      .where(eq(schema.expenses.id, existing.expenseId));
    await tx
      .delete(schema.hamaliPaid)
      .where(eq(schema.hamaliPaid.date, parsed.data.date));
  });
  revalidateHamali();
  return { ok: true };
}
