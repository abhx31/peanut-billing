"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { today } from "@/lib/format";

const addSettlementSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.number().positive(),
  mode: z.enum(["Cash", "UPI"]),
  note: z.string().trim().max(240).optional().default(""),
});

const delSettlementSchema = z.object({ id: z.string().uuid() });

type Result = { ok: true } | { ok: false; error: string };

export async function addCjSettlement(
  input: z.input<typeof addSettlementSchema>,
): Promise<Result> {
  const session = await requireOwnerOrEditor();
  const parsed = addSettlementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the amount CJ gave you." };
  const closed = await closedDateError(parsed.data.date ?? today());
  if (closed) return { ok: false, error: closed };

  await db.insert(schema.cjSettlements).values({
    date: parsed.data.date ?? today(),
    amount: parsed.data.amount.toString(),
    mode: parsed.data.mode,
    note: parsed.data.note || null,
    createdBy: session.user.id,
  });
  revalidatePath("/cj");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteCjSettlement(
  input: z.input<typeof delSettlementSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = delSettlementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid settlement." };
  await db
    .delete(schema.cjSettlements)
    .where(eq(schema.cjSettlements.id, parsed.data.id));
  revalidatePath("/cj");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}
