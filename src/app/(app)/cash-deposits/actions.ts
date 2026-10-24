"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { getCurrentLoc } from "@/lib/loc";

type Result = { ok: true } | { ok: false; error: string };

function revalidateAll() {
  revalidatePath("/cash-deposits");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
}

const saveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  note: z.string().max(300).optional(),
});

export async function addCashDeposit(input: z.input<typeof saveSchema>): Promise<Result> {
  const session = await requireOwnerOrEditor();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const closed = await closedDateError(parsed.data.date);
  if (closed) return { ok: false, error: closed };
  const loc = await getCurrentLoc();

  await db.insert(schema.cashDeposits).values({
    date: parsed.data.date,
    amount: parsed.data.amount.toString(),
    note: parsed.data.note || null,
    loc,
    createdBy: session.user.id,
  });
  revalidateAll();
  return { ok: true };
}

const updateSchema = saveSchema.extend({ id: z.string().uuid() });

export async function updateCashDeposit(
  input: z.input<typeof updateSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const existing = await db.query.cashDeposits.findFirst({
    where: eq(schema.cashDeposits.id, parsed.data.id),
  });
  if (!existing) return { ok: false, error: "Deposit not found." };

  // Guard both the old and new date against a closed financial year, same as
  // the bill/patti editors do when their date can move.
  if (parsed.data.date !== existing.date) {
    const closedOld = await closedDateError(existing.date);
    if (closedOld) return { ok: false, error: closedOld };
  }
  const closedNew = await closedDateError(parsed.data.date);
  if (closedNew) return { ok: false, error: closedNew };

  await db
    .update(schema.cashDeposits)
    .set({
      date: parsed.data.date,
      amount: parsed.data.amount.toString(),
      note: parsed.data.note || null,
    })
    .where(eq(schema.cashDeposits.id, parsed.data.id));
  revalidateAll();
  return { ok: true };
}

const idSchema = z.object({ id: z.string().uuid() });

export async function deleteCashDeposit(
  input: z.input<typeof idSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid deposit." };

  await db.delete(schema.cashDeposits).where(eq(schema.cashDeposits.id, parsed.data.id));
  revalidateAll();
  return { ok: true };
}
