"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { fyOf, r2 } from "@/lib/format";
import { closedDateError } from "@/lib/year-close";

const editItemSchema = z.object({
  itemId: z.string().uuid(),
  lotId: z.string().uuid(),
  rate: z.number().positive(),
});

const editBillSchema = z.object({
  billId: z.string().uuid(),
  // Optional so legacy callers that only sent items still work.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customer: z.string().trim().min(1).max(120).optional(),
  items: z.array(editItemSchema).min(1),
});

type Result = { ok: true } | { ok: false; error: string };

/**
 * Edit a non-GST bill: change each line's lot and/or price per kg.
 * Bags, weight and payments stay the same. Totals (hamali/gst/total) are recomputed.
 */
export async function editBill(
  input: z.input<typeof editBillSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = editBillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const bill = await db.query.bills.findFirst({
    where: eq(schema.bills.id, parsed.data.billId),
    with: { items: true },
  });
  if (!bill) return { ok: false, error: "Bill not found." };
  if (bill.kind !== "normal") {
    return { ok: false, error: "GST invoices cannot be edited here." };
  }

  // If the user moved the bill to a different date, make sure both the old
  // date's and the new date's FYs are still open. Only the bill row's own date
  // moves — payments on the bill keep their own date because that's when the
  // money actually changed hands.
  const nextDate = parsed.data.date;
  const nextCustomer = parsed.data.customer?.trim();
  if (nextDate && nextDate !== bill.date) {
    const closedOld = await closedDateError(bill.date);
    if (closedOld) return { ok: false, error: closedOld };
    const closedNew = await closedDateError(nextDate);
    if (closedNew) return { ok: false, error: closedNew };
  }

  const itemsOnBill = new Map(bill.items.map((i) => [i.id, i]));
  for (const it of parsed.data.items) {
    if (!itemsOnBill.has(it.itemId)) {
      return { ok: false, error: "An item does not belong to this bill." };
    }
  }

  const lotIds = Array.from(new Set(parsed.data.items.map((i) => i.lotId)));
  const lots = await db
    .select()
    .from(schema.lots)
    .where(inArray(schema.lots.id, lotIds));
  const lotMap = new Map(lots.map((l) => [l.id, l]));
  for (const it of parsed.data.items) {
    if (!lotMap.has(it.lotId)) {
      return { ok: false, error: "One of the selected lots was not found." };
    }
  }

  await db.transaction(async (tx) => {
    let newAmount = 0;
    for (const edit of parsed.data.items) {
      const existing = itemsOnBill.get(edit.itemId)!;
      const kg = Number(existing.kg);
      const amount = r2(kg * edit.rate);
      newAmount += amount;
      const lot = lotMap.get(edit.lotId)!;
      await tx
        .update(schema.billItems)
        .set({
          lotId: lot.id,
          lotNameSnapshot: lot.name,
          rate: edit.rate.toString(),
          amount: amount.toString(),
        })
        .where(eq(schema.billItems.id, edit.itemId));
    }
    newAmount = r2(newAmount);
    const gstPct = Number(bill.gstPercent);
    const newGst = r2((newAmount * gstPct) / 100);
    // Match the create path: round the invoice total to the nearest rupee.
    const newTotal = Math.round(newAmount + Number(bill.hamali) + newGst);
    const update: Record<string, unknown> = {
      amount: newAmount.toString(),
      gst: newGst.toString(),
      total: newTotal.toString(),
    };
    if (nextDate && nextDate !== bill.date) {
      update.date = nextDate;
      update.fy = fyOf(nextDate);
    }
    if (nextCustomer && nextCustomer !== bill.customer) {
      update.customer = nextCustomer;
    }
    await tx
      .update(schema.bills)
      .set(update)
      .where(eq(schema.bills.id, parsed.data.billId));
  });

  revalidatePath("/day");
  revalidatePath("/dashboard");
  revalidatePath("/profit");
  revalidatePath("/balances");
  return { ok: true };
}
