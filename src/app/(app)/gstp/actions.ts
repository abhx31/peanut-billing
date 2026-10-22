"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { getCurrentLoc } from "@/lib/loc";
import { fyOf, r2 } from "@/lib/format";

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  gstin: z.string().trim().max(15).optional().default(""),
  address: z.string().trim().max(240).optional().default(""),
  state: z.string().trim().max(60).optional().default(""),
  code: z.string().trim().max(5).optional().default(""),
});

const itemSchema = z.object({
  lotId: z.string().uuid(),
  description: z.string().trim().max(160).optional().default("Ground Nuts"),
  hsn: z.string().trim().max(16).optional().default("12023090"),
  bags: z.number().int().positive(),
  kg: z.number().positive(),
  rate: z.number().min(0),
});

const saveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  party: z.string().trim().min(1).max(160),
  supplier: supplierSchema,
  invNo: z.string().trim().max(60).optional().default(""),
  invDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  items: z.array(itemSchema).min(1, "Add at least one line."),
  pct: z.number().min(0).max(100).default(5),
  firmCode: z.string().trim().max(5).optional().default(""),
  itcOn: z.boolean().default(true),
  addToStock: z.boolean().default(true),
  paidMode: z.enum(["", "Cash", "UPI"]).optional().default(""),
});

type Result =
  | { ok: true; id: string; no: number; fy: string }
  | { ok: false; error: string };

export async function saveGstPurchase(
  input: z.input<typeof saveSchema>,
): Promise<Result> {
  const session = await requireOwnerOrEditor();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;
  const closed = await closedDateError(d.date);
  if (closed) return { ok: false, error: closed };

  const fy = fyOf(d.date);
  const loc = await getCurrentLoc();

  // Compute totals.
  const items = d.items.map((it) => ({
    ...it,
    amount: r2(it.kg * it.rate),
  }));
  const taxable = r2(items.reduce((s, it) => s + it.amount, 0));
  const bags = items.reduce((s, it) => s + it.bags, 0);
  const kg = r2(items.reduce((s, it) => s + it.kg, 0));
  const rate =
    kg > 0 ? r2(taxable / kg) : 0; // avg; stored on the top-level amount/rate for compatibility

  const intra =
    (d.firmCode ?? "").toString().trim() ===
    (d.supplier.code ?? "").toString().trim();
  const totalTax = r2((taxable * d.pct) / 100);
  const cgst = intra ? r2(totalTax / 2) : 0;
  const sgst = intra ? r2(totalTax - cgst) : 0;
  const igst = intra ? 0 : totalTax;
  const preRound = r2(taxable + cgst + sgst + igst);
  const net = Math.round(preRound);
  const roundOff = r2(net - preRound);
  const paidMode = d.paidMode === "" ? null : d.paidMode;
  const paidDate = paidMode ? d.date : null;
  const itc = d.itcOn ? totalTax : 0;

  try {
    const result = await db.transaction(async (tx) => {
      const noRes = await tx.execute<{ no: number }>(
        sql`select next_patti_no(${fy}, 'gstp') as no`,
      );
      const no = noRes.rows[0].no;

      const [row] = await tx
        .insert(schema.pattiBills)
        .values({
          kind: "gstp",
          no,
          fy,
          date: d.date,
          party: d.party,
          bags,
          kg: kg.toString(),
          rate: rate.toString(),
          amount: taxable.toString(),
          net: net.toString(),
          paidMode,
          paidDate,
          supplier: d.supplier,
          invNo: d.invNo || null,
          invDate: d.invDate ?? null,
          items: items.map((it) => ({
            lotId: it.lotId,
            description: it.description,
            hsn: it.hsn,
            bags: it.bags,
            kg: it.kg,
            rate: it.rate,
            amount: it.amount,
          })),
          pct: d.pct.toString(),
          taxable: taxable.toString(),
          tax: {
            intra,
            pct: d.pct,
            cgst,
            sgst,
            igst,
            roundOff,
          },
          itcOn: d.itcOn,
          itc: itc.toString(),
          stock: d.addToStock,
          createdBy: session.user.id,
        })
        .returning({ id: schema.pattiBills.id });

      if (d.addToStock) {
        await tx.insert(schema.stockIn).values(
          items.map((it) => ({
            lotId: it.lotId,
            bags: it.bags,
            date: d.date,
            loc: loc === "NM" ? "NM" : "MS",
            src: "gstp",
            ref: row.id,
            createdBy: session.user.id,
          })),
        );
      }

      return { id: row.id, no };
    });

    revalidatePath("/gstp");
    revalidatePath("/ledger");
    revalidatePath("/dashboard");
    revalidatePath("/stock");
    revalidatePath("/lots");
    return { ok: true, id: result.id, no: result.no, fy };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save the GST purchase.",
    };
  }
}

type SimpleResult = { ok: true } | { ok: false; error: string };

const markPaidSchema = z.object({
  id: z.string().uuid(),
  mode: z.enum(["Cash", "UPI"]),
});
const idSchema = z.object({ id: z.string().uuid() });

/**
 * Mark an existing GST purchase as paid *today* — not on the invoice's own
 * date. A GST purchase invoice is often entered with a backdated supplier
 * invoice date, or created unpaid and settled later on credit terms; tying
 * the payment to that date (as saveGstPurchase does when paidMode is set at
 * creation) makes the money leave cash/bank on the wrong day in the Daily
 * ledger. This mirrors patti's markPattiPaid.
 */
export async function markGstPurchasePaid(
  input: z.input<typeof markPaidSchema>,
): Promise<SimpleResult> {
  await requireOwnerOrEditor();
  const parsed = markPaidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const paidDate = new Date().toISOString().slice(0, 10);
  const closed = await closedDateError(paidDate);
  if (closed) return { ok: false, error: closed };

  await db
    .update(schema.pattiBills)
    .set({ paidMode: parsed.data.mode, paidDate })
    .where(eq(schema.pattiBills.id, parsed.data.id));
  revalidatePath("/gstp");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function unmarkGstPurchasePaid(
  input: z.input<typeof idSchema>,
): Promise<SimpleResult> {
  await requireOwnerOrEditor();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id." };

  await db
    .update(schema.pattiBills)
    .set({ paidMode: null, paidDate: null })
    .where(eq(schema.pattiBills.id, parsed.data.id));
  revalidatePath("/gstp");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteGstPurchase(
  input: z.input<typeof idSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireOwnerOrEditor();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id." };
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.stockIn)
      .where(
        and(
          eq(schema.stockIn.src, "gstp"),
          eq(schema.stockIn.ref, parsed.data.id),
        ),
      );
    await tx
      .delete(schema.pattiBills)
      .where(eq(schema.pattiBills.id, parsed.data.id));
  });
  revalidatePath("/gstp");
  revalidatePath("/stock");
  revalidatePath("/lots");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}
