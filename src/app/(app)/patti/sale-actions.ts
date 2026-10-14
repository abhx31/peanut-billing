"use server";

import { sql, inArray } from "drizzle-orm";
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
  const net = r2(amount - cd - labor + d.brSign * broker - d.transport);
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
