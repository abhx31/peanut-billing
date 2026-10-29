"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { fyOf, r2, roundRupee } from "@/lib/format";
import { closedDateError } from "@/lib/year-close";

const editItemSchema = z.object({
  // Present = update that existing line; absent = insert a new line.
  itemId: z.string().uuid().optional(),
  lotId: z.string().uuid(),
  weightsText: z.string().max(500).optional().default(""),
  bags: z.number().int().positive(),
  kg: z.number().positive(),
  rate: z.number().positive(),
});

const editBillSchema = z.object({
  billId: z.string().uuid(),
  // All optional so legacy callers that only sent items still work.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customer: z.string().trim().min(1).max(120).optional(),
  hamaliPerBag: z.number().min(0).optional(),
  items: z.array(editItemSchema).min(1),
});

type Result = { ok: true } | { ok: false; error: string };

/**
 * Edit a non-GST bill: date, customer, hamali per bag, and the full set of
 * lot lines (change lot/bags/weight/price per line, add new lines, or remove
 * existing ones). Payments are untouched — use the Receive / receipt-delete
 * actions for those. Totals (amount/hamali/gst/total) are recomputed and the
 * total is rounded to the nearest rupee, matching the create path.
 */
export async function editBill(
  input: z.input<typeof editBillSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = editBillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

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
  const nextHamaliPerBag = parsed.data.hamaliPerBag;
  if (nextDate && nextDate !== bill.date) {
    const closedOld = await closedDateError(bill.date);
    if (closedOld) return { ok: false, error: closedOld };
    const closedNew = await closedDateError(nextDate);
    if (closedNew) return { ok: false, error: closedNew };
  }

  const itemsOnBill = new Map(bill.items.map((i) => [i.id, i]));
  for (const it of parsed.data.items) {
    if (it.itemId && !itemsOnBill.has(it.itemId)) {
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

  // Any existing line not present in the submitted set was removed in the dialog.
  const submittedIds = new Set(
    parsed.data.items.filter((i) => i.itemId).map((i) => i.itemId!),
  );
  const toDelete = bill.items
    .filter((i) => !submittedIds.has(i.id))
    .map((i) => i.id);

  await db.transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx
        .delete(schema.billItems)
        .where(inArray(schema.billItems.id, toDelete));
    }

    let newAmount = 0;
    let totalBags = 0;
    let position = 0;
    for (const edit of parsed.data.items) {
      const amount = r2(edit.kg * edit.rate);
      newAmount += amount;
      totalBags += edit.bags;
      const lot = lotMap.get(edit.lotId)!;
      if (edit.itemId) {
        await tx
          .update(schema.billItems)
          .set({
            position,
            lotId: lot.id,
            lotNameSnapshot: lot.name,
            weightsText: edit.weightsText || null,
            bags: edit.bags,
            kg: edit.kg.toString(),
            rate: edit.rate.toString(),
            amount: amount.toString(),
          })
          .where(eq(schema.billItems.id, edit.itemId));
      } else {
        await tx.insert(schema.billItems).values({
          billId: parsed.data.billId,
          position,
          lotId: lot.id,
          lotNameSnapshot: lot.name,
          weightsText: edit.weightsText || null,
          bags: edit.bags,
          kg: edit.kg.toString(),
          rate: edit.rate.toString(),
          amount: amount.toString(),
        });
      }
      position++;
    }

    newAmount = r2(newAmount);
    const hamaliPerBag = nextHamaliPerBag ?? Number(bill.hamaliPerBag);
    const newHamali = r2(totalBags * hamaliPerBag);
    const gstPct = Number(bill.gstPercent);
    const newGst = r2((newAmount * gstPct) / 100);
    // Match the create path: round the invoice total to the nearest rupee.
    const newTotal = roundRupee(newAmount + newHamali + newGst);

    const update: Record<string, unknown> = {
      amount: newAmount.toString(),
      hamaliPerBag: hamaliPerBag.toString(),
      hamali: newHamali.toString(),
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
  revalidatePath("/stock");
  revalidatePath("/lots");
  revalidatePath("/ledger");
  return { ok: true };
}
