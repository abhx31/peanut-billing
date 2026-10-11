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

export async function payHamali(input: z.input<typeof paySchema>): Promise<Result> {
  const session = await requireOwnerOrEditor();
  const parsed = paySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the amount and mode." };
  const closed = await closedDateError(parsed.data.date);
  if (closed) return { ok: false, error: closed };

  // Sum bags on that date's bills — used only for the note.
  const [row] = await db
    .select({ bags: sql<number>`coalesce(sum(${schema.billItems.bags}), 0)::int` })
    .from(schema.billItems)
    .innerJoin(schema.bills, eq(schema.billItems.billId, schema.bills.id))
    .where(sql`${schema.bills.date} = ${parsed.data.date} AND ${schema.bills.hamali}::numeric > 0`);
  const bags = Number(row?.bags ?? 0);

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
        note: bags > 0 ? `Hamali for ${bags} bags` : "Hamali",
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

  revalidatePath("/hamali");
  revalidatePath("/expenses");
  revalidatePath("/ledger");
  revalidatePath("/profit");
  revalidatePath("/dashboard");
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
  revalidatePath("/hamali");
  revalidatePath("/expenses");
  revalidatePath("/ledger");
  revalidatePath("/profit");
  revalidatePath("/dashboard");
  return { ok: true };
}
