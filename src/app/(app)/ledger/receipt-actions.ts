"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";

const idSchema = z.object({ id: z.string().uuid() });
type Result = { ok: true } | { ok: false; error: string };

/** Delete a single bill-payment row. Owner/editor only. */
export async function deleteBillPayment(
  input: z.input<typeof idSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id." };

  const row = await db.query.payments.findFirst({
    where: eq(schema.payments.id, parsed.data.id),
  });
  if (!row) return { ok: false, error: "Receipt not found." };
  const closed = await closedDateError(row.date);
  if (closed) return { ok: false, error: closed };

  await db.delete(schema.payments).where(eq(schema.payments.id, parsed.data.id));
  revalidatePath("/ledger");
  revalidatePath("/day");
  revalidatePath("/balances");
  revalidatePath("/dashboard");
  revalidatePath("/profit");
  return { ok: true };
}

/** Delete a single opening-payment (old-due receipt) row. Owner/editor only.
 *  If this leaves an "Advance received" marker opening_due with no payments
 *  linked, the marker is removed too (same transaction). */
export async function deleteOldDuePayment(
  input: z.input<typeof idSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id." };

  const row = await db.query.openingPayments.findFirst({
    where: eq(schema.openingPayments.id, parsed.data.id),
  });
  if (!row) return { ok: false, error: "Receipt not found." };
  const closed = await closedDateError(row.date);
  if (closed) return { ok: false, error: closed };

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.openingPayments)
      .where(eq(schema.openingPayments.id, parsed.data.id));
    // If this receipt was linked to an "Advance received" marker and no
    // payments remain against it, remove the marker too.
    const parent = await tx.query.openingDues.findFirst({
      where: eq(schema.openingDues.id, row.openingDueId),
    });
    if (
      parent &&
      Number(parent.amount) === 0 &&
      (parent.note ?? "").toLowerCase().includes("advance")
    ) {
      const siblings = await tx
        .select({ id: schema.openingPayments.id })
        .from(schema.openingPayments)
        .where(eq(schema.openingPayments.openingDueId, parent.id))
        .limit(1);
      if (siblings.length === 0) {
        await tx
          .delete(schema.openingDues)
          .where(eq(schema.openingDues.id, parent.id));
      }
    }
  });
  revalidatePath("/ledger");
  revalidatePath("/recv");
  revalidatePath("/balances");
  revalidatePath("/dashboard");
  return { ok: true };
}
