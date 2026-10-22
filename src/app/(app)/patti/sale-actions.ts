"use server";

import { eq, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { getCurrentLoc } from "@/lib/loc";
import { fyOf, r2 } from "@/lib/format";

const saleItemSchema = z.object({
  lotId: z.string().uuid(),
  weightsText: z.string().max(500).optional().default(""),
  bags: z.number().int().positive(),
  kg: z.number().positive(),
  rate: z.number().positive(),
});

const saveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  buyer: z.string().trim().min(1).max(160),
  items: z.array(saleItemSchema).min(1).max(50),
  cdPct: z.number().min(0).default(0),
  labRate: z.number().min(0).default(0),
  brRate: z.number().min(0).default(0),
  brSign: z.union([z.literal(1), z.literal(-1)]).default(1),
  transport: z.number().min(0).default(0),
  payCash: z.number().min(0).default(0),
  payUpi: z.number().min(0).default(0),
  payCj: z.number().min(0).default(0),
});

type Result =
  | { ok: true; billId: string; no: number; fy: string }
  | { ok: false; error: string };

export async function saveSalePatti(
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

  // Totals across every lot line. CD / labour / broker apply to the whole bill.
  const bagsTotal = d.items.reduce((s, i) => s + i.bags, 0);
  const amount = r2(d.items.reduce((s, i) => s + i.kg * i.rate, 0));
  const cd = r2((amount * d.cdPct) / 100);
  const labor = r2(bagsTotal * d.labRate);
  const broker = r2(bagsTotal * d.brRate);
  // Round the sale-patti net to the nearest rupee; the ±paise difference
  // surfaces on the print as a Round Off line.
  const net = Math.round(amount - cd - labor + d.brSign * broker - d.transport);
  const total = net;

  try {
    const result = await db.transaction(async (tx) => {
      // Fetch every referenced lot once, so we can snapshot their names into
      // bill_items without one query per line.
      const lotIds = Array.from(new Set(d.items.map((i) => i.lotId)));
      const lotRows = await tx
        .select()
        .from(schema.lots)
        .where(inArray(schema.lots.id, lotIds));
      const lotById = new Map(lotRows.map((l) => [l.id, l]));
      for (const it of d.items) {
        if (!lotById.has(it.lotId)) {
          throw new Error("A selected lot was not found.");
        }
      }

      // Sale patti uses its OWN 01..NN series per FY (kind='psale').
      const noRes = await tx.execute<{ no: number }>(
        sql`select coalesce(max(no), 0) + 1 as no from bills where fy = ${fy} and kind = 'psale'`,
      );
      const no = noRes.rows[0].no;

      const [bill] = await tx
        .insert(schema.bills)
        .values({
          kind: "psale",
          no,
          fy,
          date: d.date,
          customer: d.buyer,
          loc: loc === "NM" ? "NM" : "MS",
          hamaliPerBag: "0",
          hamali: "0",
          gstPercent: "0",
          gst: "0",
          amount: amount.toString(),
          total: total.toString(),
          paidNow: (d.payCash + d.payUpi + d.payCj).toString(),
          patti: {
            cdPct: d.cdPct,
            cd,
            labRate: d.labRate,
            labor,
            brRate: d.brRate,
            broker,
            brSign: d.brSign,
            transport: d.transport,
          },
          createdBy: session.user.id,
        })
        .returning({ id: schema.bills.id });

      const itemRows = d.items.map((it, idx) => ({
        billId: bill.id,
        position: idx,
        lotId: it.lotId,
        lotNameSnapshot: lotById.get(it.lotId)!.name,
        weightsText: it.weightsText ? it.weightsText : null,
        bags: it.bags,
        kg: it.kg.toString(),
        rate: it.rate.toString(),
        amount: r2(it.kg * it.rate).toString(),
      }));
      await tx.insert(schema.billItems).values(itemRows);

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
      if (d.payCj > 0) {
        payRows.push({
          billId: bill.id,
          date: d.date,
          mode: "CJ",
          amount: d.payCj.toString(),
          createdBy: session.user.id,
        });
      }
      if (payRows.length) await tx.insert(schema.payments).values(payRows);

      return { billId: bill.id, no };
    });
    revalidatePath("/patti");
    revalidatePath("/day");
    revalidatePath("/stock");
    revalidatePath("/lots");
    revalidatePath("/balances");
    revalidatePath("/ledger");
    revalidatePath("/dashboard");
    revalidatePath("/profit");
    return { ok: true, billId: result.billId, no: result.no, fy };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save the sale patti.",
    };
  }
}

type SalePattiAdjustments = {
  cdPct?: number;
  labRate?: number;
  brRate?: number;
  brSign?: 1 | -1;
  transport?: number;
};

export async function getSalePattiForEdit(billId: string) {
  await requireOwnerOrEditor();
  const bill = await db.query.bills.findFirst({
    where: eq(schema.bills.id, billId),
    with: { items: true },
  });
  if (!bill || bill.kind !== "psale") return null;
  const patti = (bill.patti ?? {}) as SalePattiAdjustments;
  return {
    billId: bill.id,
    no: bill.no,
    date: bill.date,
    buyer: bill.customer,
    items: bill.items
      .sort((a, b) => a.position - b.position)
      .map((it) => ({
        itemId: it.id,
        lotId: it.lotId,
        lotName: it.lotNameSnapshot,
        bags: it.bags,
        kg: Number(it.kg),
        rate: Number(it.rate),
        weightsText: it.weightsText ?? "",
      })),
    cdPct: patti.cdPct ?? 0,
    labRate: patti.labRate ?? 0,
    brRate: patti.brRate ?? 0,
    brSign: patti.brSign ?? 1,
    transport: patti.transport ?? 0,
  };
}

const editItemSchema = z.object({
  // Present = update that existing line; absent = insert a new line.
  itemId: z.string().uuid().optional(),
  lotId: z.string().uuid(),
  weightsText: z.string().max(500).optional().default(""),
  bags: z.number().int().positive(),
  kg: z.number().positive(),
  rate: z.number().positive(),
});

const editSaleSchema = z.object({
  billId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  buyer: z.string().trim().min(1).max(160),
  items: z.array(editItemSchema).min(1),
  cdPct: z.number().min(0).default(0),
  labRate: z.number().min(0).default(0),
  brRate: z.number().min(0).default(0),
  brSign: z.union([z.literal(1), z.literal(-1)]).default(1),
  transport: z.number().min(0).default(0),
});

/**
 * Edit a sale patti: date, buyer, the patti-style adjustments, and the full
 * set of lot lines (change lot/bags/weight/price, add new lines, or remove
 * existing ones). Payments are untouched — use Receive / the receipt-delete
 * actions for those. Mirrors edit-actions.ts's editBill, but also recomputes
 * the CD/labour/brokerage/transport net the way saveSalePatti does, since
 * the generic bill editor doesn't know about patti-style adjustments.
 */
export async function updateSalePatti(
  input: z.input<typeof editSaleSchema>,
): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = editSaleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const bill = await db.query.bills.findFirst({
    where: eq(schema.bills.id, d.billId),
    with: { items: true },
  });
  if (!bill) return { ok: false, error: "Sale patti not found." };
  if (bill.kind !== "psale") return { ok: false, error: "Not a sale patti." };

  if (d.date !== bill.date) {
    const closedOld = await closedDateError(bill.date);
    if (closedOld) return { ok: false, error: closedOld };
  }
  const closedNew = await closedDateError(d.date);
  if (closedNew) return { ok: false, error: closedNew };

  const itemsOnBill = new Map(bill.items.map((i) => [i.id, i]));
  for (const it of d.items) {
    if (it.itemId && !itemsOnBill.has(it.itemId)) {
      return { ok: false, error: "An item does not belong to this sale patti." };
    }
  }

  const lotIds = Array.from(new Set(d.items.map((i) => i.lotId)));
  const lotRows = await db.select().from(schema.lots).where(inArray(schema.lots.id, lotIds));
  const lotMap = new Map(lotRows.map((l) => [l.id, l]));
  for (const it of d.items) {
    if (!lotMap.has(it.lotId)) {
      return { ok: false, error: "One of the selected lots was not found." };
    }
  }

  const submittedIds = new Set(d.items.filter((i) => i.itemId).map((i) => i.itemId!));
  const toDelete = bill.items.filter((i) => !submittedIds.has(i.id)).map((i) => i.id);

  const bagsTotal = d.items.reduce((s, i) => s + i.bags, 0);
  const amount = r2(d.items.reduce((s, i) => s + i.kg * i.rate, 0));
  const cd = r2((amount * d.cdPct) / 100);
  const labor = r2(bagsTotal * d.labRate);
  const broker = r2(bagsTotal * d.brRate);
  const net = Math.round(amount - cd - labor + d.brSign * broker - d.transport);

  try {
    await db.transaction(async (tx) => {
      if (toDelete.length > 0) {
        await tx.delete(schema.billItems).where(inArray(schema.billItems.id, toDelete));
      }

      let position = 0;
      for (const it of d.items) {
        const lot = lotMap.get(it.lotId)!;
        const lineAmount = r2(it.kg * it.rate);
        if (it.itemId) {
          await tx
            .update(schema.billItems)
            .set({
              position,
              lotId: lot.id,
              lotNameSnapshot: lot.name,
              weightsText: it.weightsText || null,
              bags: it.bags,
              kg: it.kg.toString(),
              rate: it.rate.toString(),
              amount: lineAmount.toString(),
            })
            .where(eq(schema.billItems.id, it.itemId));
        } else {
          await tx.insert(schema.billItems).values({
            billId: d.billId,
            position,
            lotId: lot.id,
            lotNameSnapshot: lot.name,
            weightsText: it.weightsText || null,
            bags: it.bags,
            kg: it.kg.toString(),
            rate: it.rate.toString(),
            amount: lineAmount.toString(),
          });
        }
        position++;
      }

      const update: Record<string, unknown> = {
        amount: amount.toString(),
        total: net.toString(),
        patti: {
          cdPct: d.cdPct,
          cd,
          labRate: d.labRate,
          labor,
          brRate: d.brRate,
          broker,
          brSign: d.brSign,
          transport: d.transport,
        },
      };
      if (d.date !== bill.date) {
        update.date = d.date;
        update.fy = fyOf(d.date);
      }
      const buyerTrimmed = d.buyer.trim();
      if (buyerTrimmed !== bill.customer) update.customer = buyerTrimmed;

      await tx.update(schema.bills).set(update).where(eq(schema.bills.id, d.billId));
    });

    revalidatePath("/patti");
    revalidatePath("/day");
    revalidatePath("/stock");
    revalidatePath("/lots");
    revalidatePath("/balances");
    revalidatePath("/ledger");
    revalidatePath("/dashboard");
    revalidatePath("/profit");
    return { ok: true, billId: d.billId, no: bill.no, fy: bill.fy };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update the sale patti.",
    };
  }
}
