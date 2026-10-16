"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { customerKey } from "@/lib/queries";

const schemaForNote = z.object({
  customer: z.string().trim().min(1).max(160),
  // "" clears the note entirely; anything else is saved as-is.
  note: z.string().max(1000),
});

type Result = { ok: true } | { ok: false; error: string };

export async function setCustomerNote(
  input: z.input<typeof schemaForNote>,
): Promise<Result> {
  const session = await requireOwnerOrEditor();
  const parsed = schemaForNote.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const key = customerKey(parsed.data.customer);
  const trimmed = parsed.data.note.trim();

  if (trimmed === "") {
    await db
      .delete(schema.customerNotes)
      .where(eq(schema.customerNotes.customerKey, key));
  } else {
    await db
      .insert(schema.customerNotes)
      .values({
        customerKey: key,
        note: trimmed,
        updatedBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: schema.customerNotes.customerKey,
        set: {
          note: trimmed,
          updatedAt: new Date(),
          updatedBy: session.user.id,
        },
      });
  }

  revalidatePath("/balances");
  return { ok: true };
}
