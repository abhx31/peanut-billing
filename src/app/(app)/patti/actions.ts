"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { getCurrentLoc } from "@/lib/loc";
import { fyOf, r2 } from "@/lib/format";

const savePattiSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  party: z.string().trim().min(1).max(120),
  lotName: z.string().trim().max(120).optional().default(""),
  weightsText: z.string().trim().max(500).optional().default(""),
  bags: z.number().int().positive(),
  kg: z.number().positive(),
  rate: z.number().positive(),
  cdPct: z.number().min(0).default(0),
  labRate: z.number().min(0).default(0),
  brRate: z.number().min(0).default(0),
  brSign: z.union([z.literal(1), z.literal(-1)]).default(-1),
  transport: z.number().min(0).default(0),
  paidMode: z.enum(["", "Cash", "UPI"]).optional().default(""),
  // v2: optional "Add these bags to my stock". Requires a lotId to assign the
  // bags to; the server inserts a stock_in row with src="patti" + ref=pattiId
  // so deleting the patti bill cleans the stock entry up.
  addToStock: z.boolean().optional().default(false),
  stockLotId: z.string().uuid().optional(),
});

const delPattiSchema = z.object({ id: z.string().uuid() });

type Result =
  | { ok: true; pattiId: string; pattiNo: number; fy: string }
  | { ok: false; error: string };

export async function savePatti(input: z.input<typeof savePattiSchema>): Promise<Result> {
  const session = await requireOwnerOrEditor();
  const parsed = savePattiSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Enter seller name, bags, weight and price." };
  }
  const d = parsed.data;
  const closed = await closedDateError(d.date);
  if (closed) return { ok: false, error: closed };
  const fy = fyOf(d.date);
  const amount = r2(d.kg * d.rate);
  const cd = r2((amount * d.cdPct) / 100);
  const labor = r2(d.bags * d.labRate);
  const broker = r2(d.bags * d.brRate);
  const net = r2(amount - cd - labor + d.brSign * broker - d.transport);
  const paidMode = d.paidMode === "" ? null : d.paidMode;
  const paidDate = paidMode ? d.date : null;
  const addToStock = d.addToStock && !!d.stockLotId;
  if (d.addToStock && !d.stockLotId) {
    return {
      ok: false,
      error: "Pick a lot for the bags, or uncheck Add to stock.",
    };
  }
  const loc = await getCurrentLoc();

  try {
    const result = await db.transaction(async (tx) => {
      const noRes = await tx.execute<{ no: number }>(
        sql`select next_patti_no(${fy}) as no`,
      );
      const no = noRes.rows[0].no;

      const [row] = await tx
        .insert(schema.pattiBills)
        .values({
          no,
          fy,
          date: d.date,
          party: d.party,
          lotName: d.lotName || null,
          weightsText: d.weightsText || null,
          bags: d.bags,
          kg: d.kg.toString(),
          rate: d.rate.toString(),
          amount: amount.toString(),
          cdPct: d.cdPct.toString(),
          cd: cd.toString(),
          labRate: d.labRate.toString(),
          labor: labor.toString(),
          brRate: d.brRate.toString(),
          broker: broker.toString(),
          brSign: d.brSign,
          transport: d.transport.toString(),
          net: net.toString(),
          paidMode,
          paidDate,
          stock: addToStock,
          stockLotId: addToStock ? d.stockLotId! : null,
          createdBy: session.user.id,
        })
        .returning({ id: schema.pattiBills.id });

      if (addToStock) {
        await tx.insert(schema.stockIn).values({
          lotId: d.stockLotId!,
          bags: d.bags,
          date: d.date,
          loc: loc === "NM" ? "NM" : "MS",
          src: "patti",
          ref: row.id,
          createdBy: session.user.id,
        });
      }

      return { pattiId: row.id, pattiNo: no };
    });
    revalidatePath("/patti");
    revalidatePath("/ledger");
    revalidatePath("/dashboard");
    if (addToStock) {
      revalidatePath("/stock");
      revalidatePath("/lots");
    }
    return { ok: true, pattiId: result.pattiId, pattiNo: result.pattiNo, fy };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save the patti bill.",
    };
  }
}

export async function markPattiPaid(input: {
  id: string;
  mode: "Cash" | "UPI";
  date?: string;
}): Promise<Result | { ok: true }> {
  await requireOwnerOrEditor();
  const paidDate = input.date ?? new Date().toISOString().slice(0, 10);
  const closed = await closedDateError(paidDate);
  if (closed) return { ok: false, error: closed };
  await db
    .update(schema.pattiBills)
    .set({ paidMode: input.mode, paidDate })
    .where(eq(schema.pattiBills.id, input.id));
  revalidatePath("/patti");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function unmarkPattiPaid(input: { id: string }): Promise<Result | { ok: true }> {
  await requireOwnerOrEditor();
  await db
    .update(schema.pattiBills)
    .set({ paidMode: null, paidDate: null })
    .where(eq(schema.pattiBills.id, input.id));
  revalidatePath("/patti");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deletePatti(
  input: z.input<typeof delPattiSchema>,
): Promise<Result | { ok: true }> {
  await requireOwnerOrEditor();
  const parsed = delPattiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid patti." };
  await db.transaction(async (tx) => {
    // Remove any stock_in rows this patti created via "Add to stock".
    await tx
      .delete(schema.stockIn)
      .where(
        and(
          eq(schema.stockIn.src, "patti"),
          eq(schema.stockIn.ref, parsed.data.id),
        ),
      );
    await tx
      .delete(schema.pattiBills)
      .where(eq(schema.pattiBills.id, parsed.data.id));
  });
  revalidatePath("/patti");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  revalidatePath("/lots");
  return { ok: true };
}
