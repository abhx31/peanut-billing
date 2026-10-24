"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { getCurrentLoc } from "@/lib/loc";

const saveClosingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cash: z.number().min(0).nullable().optional(),
  bank: z.number().min(0).nullable().optional(),
});

const removeClosingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Result = { ok: true } | { ok: false; error: string };

export async function saveClosing(
  input: z.input<typeof saveClosingSchema>,
): Promise<Result> {
  const session = await requireOwnerOrEditor();
  const parsed = saveClosingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter at least cash or bank." };
  if (parsed.data.cash == null && parsed.data.bank == null) {
    return { ok: false, error: "Enter at least cash in hand or bank balance." };
  }
  const closed = await closedDateError(parsed.data.date);
  if (closed) return { ok: false, error: closed };
  const loc = await getCurrentLoc();

  await db
    .insert(schema.closings)
    .values({
      date: parsed.data.date,
      loc,
      cash: parsed.data.cash?.toString() ?? null,
      bank: parsed.data.bank?.toString() ?? null,
      createdBy: session.user.id,
    })
    .onConflictDoUpdate({
      target: [schema.closings.date, schema.closings.loc],
      set: {
        cash: parsed.data.cash?.toString() ?? null,
        bank: parsed.data.bank?.toString() ?? null,
      },
    });
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function removeClosing(
  input: z.input<typeof removeClosingSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = removeClosingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid date." };
  const closed = await closedDateError(parsed.data.date);
  if (closed) return { ok: false, error: closed };
  const loc = await getCurrentLoc();
  await db
    .delete(schema.closings)
    .where(and(eq(schema.closings.date, parsed.data.date), eq(schema.closings.loc, loc)));
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}
