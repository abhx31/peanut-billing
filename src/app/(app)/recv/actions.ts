"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor, requireSession } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { getCurrentLoc, toLoc } from "@/lib/loc";
import { today } from "@/lib/format";

const addDueSchema = z.object({
  customer: z.string().trim().min(1).max(120),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(240).optional().default(""),
});

const editDueSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().positive(),
});

const delDueSchema = z.object({ id: z.string().uuid() });

const receiveDueSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().positive(),
  mode: z.enum(["Cash", "UPI", "CJ"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type Result = { ok: true } | { ok: false; error: string };

export async function addOldDue(input: z.input<typeof addDueSchema>): Promise<Result> {
  const session = await requireOwnerOrEditor();
  const parsed = addDueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the customer and amount." };
  const loc = await getCurrentLoc();

  await db.insert(schema.openingDues).values({
    customer: parsed.data.customer,
    amount: parsed.data.amount.toString(),
    date: parsed.data.date ?? today(),
    note: parsed.data.note || null,
    loc: loc === "NM" ? "NM" : "MS",
    createdBy: session.user.id,
  });
  revalidatePath("/recv");
  revalidatePath("/balances");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function editOldDue(input: z.input<typeof editDueSchema>): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = editDueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid amount." };
  await db
    .update(schema.openingDues)
    .set({ amount: parsed.data.amount.toString() })
    .where(eq(schema.openingDues.id, parsed.data.id));
  revalidatePath("/recv");
  revalidatePath("/balances");
  return { ok: true };
}

export async function deleteOldDue(input: z.input<typeof delDueSchema>): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = delDueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id." };
  await db.delete(schema.openingDues).where(eq(schema.openingDues.id, parsed.data.id));
  revalidatePath("/recv");
  revalidatePath("/balances");
  return { ok: true };
}

export async function receiveOnDue(
  input: z.input<typeof receiveDueSchema>,
): Promise<Result> {
  const session = await requireSession();
  const parsed = receiveDueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid amount." };

  const due = await db.query.openingDues.findFirst({
    where: eq(schema.openingDues.id, parsed.data.id),
  });
  if (!due) return { ok: false, error: "Old due not found." };
  const closed = await closedDateError(parsed.data.date ?? today());
  if (closed) return { ok: false, error: closed };

  const loc = await getCurrentLoc();
  if (toLoc(due.loc) !== loc) {
    return { ok: false, error: "This old due belongs to the other store. Switch store first." };
  }
  await db.insert(schema.openingPayments).values({
    openingDueId: due.id,
    customer: due.customer,
    loc: loc === "NM" ? "NM" : "MS",
    date: parsed.data.date ?? today(),
    mode: parsed.data.mode,
    amount: parsed.data.amount.toString(),
    createdBy: session.user.id,
  });
  revalidatePath("/recv");
  revalidatePath("/balances");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}
