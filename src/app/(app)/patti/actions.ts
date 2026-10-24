"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { getCurrentLoc } from "@/lib/loc";
import { fyOf, r2 } from "@/lib/format";

const pattiItemSchema = z.object({
  lotName: z.string().trim().max(120).optional().default(""),
  weightsText: z.string().trim().max(500).optional().default(""),
  bags: z.number().int().positive(),
  kg: z.number().positive(),
  rate: z.number().positive(),
});

const savePattiSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  party: z.string().trim().min(1).max(120),
  items: z.array(pattiItemSchema).optional(),
  lotName: z.string().trim().max(120).optional().default(""),
  weightsText: z.string().trim().max(500).optional().default(""),
  bags: z.number().int().positive().optional(),
  kg: z.number().positive().optional(),
  rate: z.number().positive().optional(),
  cdPct: z.number().min(0).default(0),
  labRate: z.number().min(0).default(0),
  brRate: z.number().min(0).default(0),
  brSign: z.union([z.literal(1), z.literal(-1)]).default(-1),
  transport: z.number().min(0).default(0),
  paidMode: z.enum(["", "Cash", "UPI", "CJ"]).optional().default(""),
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

  // Normalise to a list of line items. The old single-item form (no `items`
  // array) is treated as a one-element list so the aggregation below is the
  // only code path downstream.
  const lines =
    d.items && d.items.length > 0
      ? d.items.map((it) => ({
          lotName: it.lotName || "",
          weightsText: it.weightsText || "",
          bags: it.bags,
          kg: it.kg,
          rate: it.rate,
          amount: r2(it.kg * it.rate),
        }))
      : d.bags != null && d.kg != null && d.rate != null
        ? [
            {
              lotName: d.lotName || "",
              weightsText: d.weightsText || "",
              bags: d.bags,
              kg: d.kg,
              rate: d.rate,
              amount: r2(d.kg * d.rate),
            },
          ]
        : [];

  if (lines.length === 0) {
    return { ok: false, error: "Add at least one lot with bags, weight and price." };
  }

  const bagsTotal = lines.reduce((s, l) => s + l.bags, 0);
  const kgTotal = r2(lines.reduce((s, l) => s + l.kg, 0));
  const amount = r2(lines.reduce((s, l) => s + l.amount, 0));
  const avgRate = kgTotal > 0 ? r2(amount / kgTotal) : 0;
  const topLotName =
    lines.length === 1
      ? lines[0].lotName || null
      : lines.map((l) => l.lotName || "?").join(" + ") || null;
  const topWeights =
    lines.length === 1
      ? lines[0].weightsText || null
      : null;

  const cd = r2((amount * d.cdPct) / 100);
  const labor = r2(bagsTotal * d.labRate);
  const broker = r2(bagsTotal * d.brRate);
  // Round the patti net to the nearest rupee; the ±paise difference surfaces
  // on the print as a Round Off line.
  const net = Math.round(amount - cd - labor + d.brSign * broker - d.transport);
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
      // Each store runs its own 01..NN patti series.
      const noRes = await tx.execute<{ no: number }>(
        sql`select next_patti_no_for_loc(${fy}, NULL, ${loc === "NM" ? "NM" : "MS"}) as no`,
      );
      const no = noRes.rows[0].no;

      const [row] = await tx
        .insert(schema.pattiBills)
        .values({
          no,
          fy,
          date: d.date,
          party: d.party,
          loc: loc === "NM" ? "NM" : "MS",
          lotName: topLotName,
          weightsText: topWeights,
          bags: bagsTotal,
          kg: kgTotal.toString(),
          rate: avgRate.toString(),
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
          items: lines,
          stock: addToStock,
          stockLotId: addToStock ? d.stockLotId! : null,
          createdBy: session.user.id,
        })
        .returning({ id: schema.pattiBills.id });

      if (addToStock) {
        await tx.insert(schema.stockIn).values({
          lotId: d.stockLotId!,
          bags: bagsTotal,
          date: d.date,
          loc: loc === "NM" ? "NM" : "MS",
          src: "patti",
          ref: row.id,
          createdBy: session.user.id,
        });
      }

      // "Paid at creation" is just the first entry in the purchase-payments
      // ledger, same as any other payment recorded later.
      if (paidMode && paidDate) {
        await tx.insert(schema.pattiPayments).values({
          pattiId: row.id,
          date: paidDate,
          mode: paidMode,
          amount: net.toString(),
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

export async function getPattiForEdit(pattiId: string) {
  await requireOwnerOrEditor();
  const bill = await db.query.pattiBills.findFirst({
    where: eq(schema.pattiBills.id, pattiId),
  });
  if (!bill || bill.kind !== null) return null;

  type Line = { lotName?: string; weightsText?: string; bags: number; kg: number; rate: number };
  const rawItems = Array.isArray(bill.items) ? (bill.items as Line[]) : [];
  const lines: Line[] =
    rawItems.length > 0
      ? rawItems
      : [
          {
            lotName: bill.lotName ?? "",
            weightsText: bill.weightsText ?? "",
            bags: bill.bags,
            kg: Number(bill.kg),
            rate: Number(bill.rate),
          },
        ];

  return {
    pattiId: bill.id,
    no: bill.no,
    date: bill.date,
    party: bill.party,
    items: lines.map((it) => ({
      lotName: it.lotName ?? "",
      weightsText: it.weightsText ?? "",
      bags: it.bags,
      kg: Number(it.kg),
      rate: Number(it.rate),
    })),
    cdPct: Number(bill.cdPct),
    labRate: Number(bill.labRate),
    brRate: Number(bill.brRate),
    brSign: bill.brSign as 1 | -1,
    transport: Number(bill.transport),
  };
}

const editPattiSchema = z.object({
  pattiId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  party: z.string().trim().min(1).max(120),
  items: z.array(pattiItemSchema).min(1),
  cdPct: z.number().min(0).default(0),
  labRate: z.number().min(0).default(0),
  brRate: z.number().min(0).default(0),
  brSign: z.union([z.literal(1), z.literal(-1)]).default(-1),
  transport: z.number().min(0).default(0),
});

/**
 * Edit a purchase patti: date, seller, lot lines (free-text lotName, not a
 * lotId — patti lines were never tied to a specific lot, only the overall
 * "add to stock" pick is) and the CD/labour/brokerage/transport adjustments.
 * If this patti added stock, the stock_in row it created is kept in sync
 * with the new bag total so stock counts stay correct. Payments are
 * untouched — use the Payments recorded tab for those.
 */
export async function updatePatti(
  input: z.input<typeof editPattiSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = editPattiSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const bill = await db.query.pattiBills.findFirst({
    where: eq(schema.pattiBills.id, d.pattiId),
  });
  if (!bill) return { ok: false, error: "Patti bill not found." };
  if (bill.kind !== null) return { ok: false, error: "Not a purchase patti." };

  if (d.date !== bill.date) {
    const closedOld = await closedDateError(bill.date);
    if (closedOld) return { ok: false, error: closedOld };
  }
  const closedNew = await closedDateError(d.date);
  if (closedNew) return { ok: false, error: closedNew };

  const lines = d.items.map((it) => ({
    lotName: it.lotName || "",
    weightsText: it.weightsText || "",
    bags: it.bags,
    kg: it.kg,
    rate: it.rate,
    amount: r2(it.kg * it.rate),
  }));
  const bagsTotal = lines.reduce((s, l) => s + l.bags, 0);
  const kgTotal = r2(lines.reduce((s, l) => s + l.kg, 0));
  const amount = r2(lines.reduce((s, l) => s + l.amount, 0));
  const avgRate = kgTotal > 0 ? r2(amount / kgTotal) : 0;
  const topLotName =
    lines.length === 1
      ? lines[0].lotName || null
      : lines.map((l) => l.lotName || "?").join(" + ") || null;
  const topWeights = lines.length === 1 ? lines[0].weightsText || null : null;
  const cd = r2((amount * d.cdPct) / 100);
  const labor = r2(bagsTotal * d.labRate);
  const broker = r2(bagsTotal * d.brRate);
  const net = Math.round(amount - cd - labor + d.brSign * broker - d.transport);

  try {
    await db.transaction(async (tx) => {
      const update: Record<string, unknown> = {
        party: d.party,
        lotName: topLotName,
        weightsText: topWeights,
        bags: bagsTotal,
        kg: kgTotal.toString(),
        rate: avgRate.toString(),
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
        items: lines,
      };
      if (d.date !== bill.date) {
        update.date = d.date;
        update.fy = fyOf(d.date);
      }
      await tx.update(schema.pattiBills).set(update).where(eq(schema.pattiBills.id, d.pattiId));

      if (bill.stock && bill.stockLotId) {
        await tx
          .update(schema.stockIn)
          .set({ bags: bagsTotal })
          .where(and(eq(schema.stockIn.src, "patti"), eq(schema.stockIn.ref, d.pattiId)));
      }
    });

    revalidatePath("/patti");
    revalidatePath("/ledger");
    revalidatePath("/dashboard");
    revalidatePath("/stock");
    revalidatePath("/lots");
    return { ok: true, pattiId: d.pattiId, pattiNo: bill.no, fy: d.date !== bill.date ? fyOf(d.date) : bill.fy };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update the patti bill.",
    };
  }
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
