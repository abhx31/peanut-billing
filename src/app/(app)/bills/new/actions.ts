"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth-helpers";
import { fyOf, r2 } from "@/lib/format";

const saveBillSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  customer: z.string().trim().min(1).max(120),
  lotId: z.string().uuid(),
  weightsText: z.string().max(500).optional().default(""),
  bags: z.number().int().positive(),
  kg: z.number().positive(),
  rate: z.number().positive(),
  hamaliPerBag: z.number().min(0),
  gstPercent: z.number().min(0).max(100),
  payCash: z.number().min(0),
  payUpi: z.number().min(0),
});

type Result =
  | { ok: true; billId: string; billNo: number; fy: string }
  | { ok: false; error: string };

export async function saveBill(input: z.input<typeof saveBillSchema>): Promise<Result> {
  const session = await requireSession();
  const parsed = saveBillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;
  const fy = fyOf(d.date);

  const amount = r2(d.kg * d.rate);
  const hamali = r2(d.bags * d.hamaliPerBag);
  const gst = r2((amount * d.gstPercent) / 100);
  const total = r2(amount + hamali + gst);

  try {
    const result = await db.transaction(async (tx) => {
      const lot = await tx.query.lots.findFirst({
        where: eq(schema.lots.id, d.lotId),
      });
      if (!lot) throw new Error("Lot not found.");

      const noResult = await tx.execute<{ no: number }>(
        sql`select next_bill_no(${fy}) as no`,
      );
      const no = noResult.rows[0].no;

      const [bill] = await tx
        .insert(schema.bills)
        .values({
          no,
          fy,
          date: d.date,
          customer: d.customer,
          weightsText: d.weightsText || null,
          lotId: lot.id,
          lotNameSnapshot: lot.name,
          bags: d.bags,
          kg: d.kg.toString(),
          rate: d.rate.toString(),
          hamaliPerBag: d.hamaliPerBag.toString(),
          hamali: hamali.toString(),
          gstPercent: d.gstPercent.toString(),
          gst: gst.toString(),
          amount: amount.toString(),
          total: total.toString(),
          createdBy: session.user.id,
        })
        .returning({ id: schema.bills.id });

      const payRows: typeof schema.payments.$inferInsert[] = [];
      if (d.payCash > 0) {
        payRows.push({
          billId: bill.id,
          date: d.date,
          mode: "Cash",
          amount: d.payCash.toString(),
          createdBy: session.user.id,
        });
      }
      if (d.payUpi > 0) {
        payRows.push({
          billId: bill.id,
          date: d.date,
          mode: "UPI",
          amount: d.payUpi.toString(),
          createdBy: session.user.id,
        });
      }
      if (payRows.length) await tx.insert(schema.payments).values(payRows);

      return { billId: bill.id, billNo: no };
    });

    revalidatePath("/bills/new");
    revalidatePath("/lots");
    return { ok: true, billId: result.billId, billNo: result.billNo, fy };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save the bill.";
    return { ok: false, error: msg };
  }
}
