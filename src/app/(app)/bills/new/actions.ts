"use server";

import { inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { fyOf, r2 } from "@/lib/format";
import { getCurrentLoc } from "@/lib/loc";

const itemSchema = z.object({
  lotId: z.string().uuid(),
  weightsText: z.string().max(500).optional().default(""),
  bags: z.number().int().positive(),
  kg: z.number().positive(),
  rate: z.number().positive(),
});

const saveBillSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  customer: z.string().trim().min(1).max(120),
  items: z.array(itemSchema).min(1, "Add at least one lot."),
  hamaliPerBag: z.number().min(0),
  gstPercent: z.number().min(0).max(100),
  payCash: z.number().min(0),
  payUpi: z.number().min(0),
  payCj: z.number().min(0).optional().default(0),
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
  const closed = await closedDateError(d.date);
  if (closed) return { ok: false, error: closed };
  const fy = fyOf(d.date);
  const loc = await getCurrentLoc();

  const items = d.items.map((it) => ({
    ...it,
    amount: r2(it.kg * it.rate),
  }));
  const totalBags = items.reduce((s, it) => s + it.bags, 0);
  const totalAmount = r2(items.reduce((s, it) => s + it.amount, 0));
  const hamali = r2(totalBags * d.hamaliPerBag);
  const gst = r2((totalAmount * d.gstPercent) / 100);
  const total = r2(totalAmount + hamali + gst);

  try {
    const result = await db.transaction(async (tx) => {
      const lotIds = Array.from(new Set(items.map((it) => it.lotId)));
      const lots = await tx
        .select()
        .from(schema.lots)
        .where(inArray(schema.lots.id, lotIds));
      const lotMap = new Map(lots.map((l) => [l.id, l]));
      for (const it of items) {
        if (!lotMap.has(it.lotId)) {
          throw new Error("One of the selected lots was not found.");
        }
      }

      const noResult = await tx.execute<{ no: number }>(
        sql`select next_bill_no(${fy}, 'normal') as no`,
      );
      const no = noResult.rows[0].no;

      const [bill] = await tx
        .insert(schema.bills)
        .values({
          kind: "normal",
          no,
          fy,
          date: d.date,
          customer: d.customer,
          loc: loc === "NM" ? "NM" : "MS",
          hamaliPerBag: d.hamaliPerBag.toString(),
          hamali: hamali.toString(),
          gstPercent: d.gstPercent.toString(),
          gst: gst.toString(),
          amount: totalAmount.toString(),
          total: total.toString(),
          createdBy: session.user.id,
        })
        .returning({ id: schema.bills.id });

      await tx.insert(schema.billItems).values(
        items.map((it, idx) => ({
          billId: bill.id,
          position: idx,
          lotId: it.lotId,
          lotNameSnapshot: lotMap.get(it.lotId)!.name,
          weightsText: it.weightsText || null,
          bags: it.bags,
          kg: it.kg.toString(),
          rate: it.rate.toString(),
          amount: it.amount.toString(),
        })),
      );

      const payRows: (typeof schema.payments.$inferInsert)[] = [];
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
      if (d.payCj && d.payCj > 0) {
        payRows.push({
          billId: bill.id,
          date: d.date,
          mode: "CJ",
          amount: d.payCj.toString(),
          createdBy: session.user.id,
        });
      }
      if (payRows.length) await tx.insert(schema.payments).values(payRows);

      return { billId: bill.id, billNo: no };
    });

    revalidatePath("/bills/new");
    revalidatePath("/lots");
    revalidatePath("/day");
    revalidatePath("/stock");
    revalidatePath("/nm");
    revalidatePath("/cj");
    revalidatePath("/dashboard");
    return { ok: true, billId: result.billId, billNo: result.billNo, fy };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save the bill.";
    return { ok: false, error: msg };
  }
}
