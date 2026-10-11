"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor, requireSession } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { today } from "@/lib/format";

const addTransferSchema = z.object({
  lotId: z.string().uuid(),
  bags: z.number().int().positive(),
  dir: z.enum(["out", "back"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(240).optional().default(""),
});

const deleteTransferSchema = z.object({ id: z.string().uuid() });

type Result = { ok: true } | { ok: false; error: string };

export async function addTransfer(
  input: z.input<typeof addTransferSchema>,
): Promise<Result> {
  const session = await requireSession();
  const parsed = addTransferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check your inputs." };
  const closed = await closedDateError(parsed.data.date ?? today());
  if (closed) return { ok: false, error: closed };

  const lot = await db.query.lots.findFirst({
    where: eq(schema.lots.id, parsed.data.lotId),
  });
  if (!lot) return { ok: false, error: "Lot not found." };

  await db.insert(schema.transfers).values({
    lotId: lot.id,
    lotNameSnapshot: lot.name,
    bags: parsed.data.bags,
    dir: parsed.data.dir,
    date: parsed.data.date ?? today(),
    note: parsed.data.note || null,
    createdBy: session.user.id,
  });

  revalidatePath("/nm");
  revalidatePath("/stock");
  revalidatePath("/lots");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteTransfer(
  input: z.input<typeof deleteTransferSchema>,
): Promise<Result> {
  // Owner/editor only — stock moves back when deleted, which is a sensitive change.
  await requireOwnerOrEditor();
  const parsed = deleteTransferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid transfer." };

  await db.delete(schema.transfers).where(eq(schema.transfers.id, parsed.data.id));
  revalidatePath("/nm");
  revalidatePath("/stock");
  revalidatePath("/dashboard");
  return { ok: true };
}
