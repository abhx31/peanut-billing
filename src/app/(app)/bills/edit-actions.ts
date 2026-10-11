"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { r2 } from "@/lib/format";

const editItemSchema = z.object({
  itemId: z.string().uuid(),
  lotId: z.string().uuid(),
  rate: z.number().positive(),
});

const editBillSchema = z.object({
  billId: z.string().uuid(),
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
    const newTotal = r2(newAmount + Number(bill.hamali) + newGst);
    await tx
      .update(schema.bills)
      .set({
        amount: newAmount.toString(),
        gst: newGst.toString(),
        total: newTotal.toString(),
      })
      .where(eq(schema.bills.id, parsed.data.billId));
  });

  revalidatePath("/day");
  revalidatePath("/dashboard");
  revalidatePath("/profit");
  revalidatePath("/balances");
  return { ok: true };
}
