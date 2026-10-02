"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth-helpers";

const addSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().trim().min(1).max(80),
  note: z.string().trim().max(240).optional().default(""),
  amount: z.number().positive(),
  mode: z.enum(["Cash", "UPI"]),
});

const delSchema = z.object({ id: z.string().uuid() });

type Result = { ok: true } | { ok: false; error: string };

export async function addExpense(input: z.input<typeof addSchema>): Promise<Result> {
  const session = await requireSession();
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a category and an amount." };

  await db.insert(schema.expenses).values({
    date: parsed.data.date,
    category: parsed.data.category,
    note: parsed.data.note || null,
    amount: parsed.data.amount.toString(),
    mode: parsed.data.mode,
    createdBy: session.user.id,
  });
  revalidatePath("/expenses");
  revalidatePath("/ledger");
  revalidatePath("/profit");
  return { ok: true };
}

export async function deleteExpense(input: z.input<typeof delSchema>): Promise<Result> {
  await requireSession();
  const parsed = delSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid expense." };
  await db.delete(schema.expenses).where(eq(schema.expenses.id, parsed.data.id));
  revalidatePath("/expenses");
  revalidatePath("/ledger");
  revalidatePath("/profit");
  return { ok: true };
}
