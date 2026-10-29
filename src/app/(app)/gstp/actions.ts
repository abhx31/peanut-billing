"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { getCurrentLoc, toLoc } from "@/lib/loc";
import { fyOf, r2, roundRupee } from "@/lib/format";

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  gstin: z.string().trim().max(15).optional().default(""),
  address: z.string().trim().max(240).optional().default(""),
  state: z.string().trim().max(60).optional().default(""),
  code: z.string().trim().max(5).optional().default(""),
});

const itemSchema = z.object({
  // Typed lot name — any lot can be bought, not only ones already in the list.
  lotName: z.string().trim().min(1, "Enter the lot for every line.").max(120),
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
  paidMode: z.enum(["", "Cash", "UPI", "CJ"]).optional().default(""),
});

type Result =
  | { ok: true; id: string; no: number; fy: string }
  | { ok: false; error: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Lot-name match key: case and extra spaces don't matter ("Bold  50-55" = "bold 50-55"). */
const lotKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Lot id for each typed lot name. A name that matches an existing lot reuses
 * it; a new name becomes a new lot when `create` is set (the purchase adds its
 * bags to stock, so the lot must exist to hold them), otherwise it stays
 * unlinked (null) and is only recorded on the purchase.
 */
async function resolveLots(
  tx: Tx,
  names: string[],
  create: boolean,
  userId: string,
): Promise<Map<string, string | null>> {
  const byKey = new Map<string, { name: string; id: string | null }>();
  for (const n of names) {
    const k = lotKey(n);
    if (!byKey.has(k)) byKey.set(k, { name: n.trim(), id: null });
  }
  const keys = [...byKey.keys()];
  if (keys.length) {
    const existing = await tx
      .select({ id: schema.lots.id, name: schema.lots.name })
      .from(schema.lots)
      .where(
        and(
          isNull(schema.lots.deletedAt),
          inArray(sql`lower(regexp_replace(trim(${schema.lots.name}), '\\s+', ' ', 'g'))`, keys),
        ),
      );
    for (const l of existing) {
      const entry = byKey.get(lotKey(l.name));
      if (entry && !entry.id) entry.id = l.id;
    }
  }
  if (create) {
    for (const entry of byKey.values()) {
      if (entry.id) continue;
      const [lot] = await tx
        .insert(schema.lots)
        .values({ name: entry.name, createdBy: userId })
        .returning({ id: schema.lots.id });
      entry.id = lot.id;
    }
  }
  return new Map(names.map((n) => [n, byKey.get(lotKey(n))?.id ?? null]));
}

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
  const net = roundRupee(preRound);
  const roundOff = r2(net - preRound);
  const paidMode = d.paidMode === "" ? null : d.paidMode;
  const paidDate = paidMode ? d.date : null;
  const itc = d.itcOn ? totalTax : 0;

  try {
    const result = await db.transaction(async (tx) => {
      // Each store runs its own 01..NN GST purchase series.
      const noRes = await tx.execute<{ no: number }>(
        sql`select next_patti_no_for_loc(${fy}, 'gstp', ${loc === "NM" ? "NM" : "MS"}) as no`,
      );
      const no = noRes.rows[0].no;

      const lotIds = await resolveLots(
        tx,
        items.map((it) => it.lotName),
        d.addToStock,
        session.user.id,
      );

      const [row] = await tx
        .insert(schema.pattiBills)
        .values({
          kind: "gstp",
          no,
          fy,
          date: d.date,
          party: d.party,
          loc: loc === "NM" ? "NM" : "MS",
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
            lotId: lotIds.get(it.lotName) ?? null,
            lotName: it.lotName,
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
            lotId: lotIds.get(it.lotName)!,
            bags: it.bags,
            date: d.date,
            loc: loc === "NM" ? "NM" : "MS",
            src: "gstp",
            ref: row.id,
            createdBy: session.user.id,
          })),
        );
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

const idSchema = z.object({ id: z.string().uuid() });

export async function getGstPurchaseForEdit(id: string) {
  await requireOwnerOrEditor();
  const bill = await db.query.pattiBills.findFirst({
    where: eq(schema.pattiBills.id, id),
  });
  if (!bill || bill.kind !== "gstp") return null;

  type Item = {
    lotId?: string | null;
    lotName?: string;
    description?: string;
    hsn?: string;
    bags: number;
    kg: number;
    rate: number;
  };
  const supplier = (bill.supplier ?? {}) as {
    name?: string;
    gstin?: string;
    address?: string;
    state?: string;
    code?: string;
  };

  const rawItems = (bill.items ?? []) as Item[];
  const ids = rawItems.map((it) => it.lotId).filter((x): x is string => !!x);
  const lotNames = new Map(
    ids.length
      ? (
          await db
            .select({ id: schema.lots.id, name: schema.lots.name })
            .from(schema.lots)
            .where(inArray(schema.lots.id, ids))
        ).map((l) => [l.id, l.name])
      : [],
  );

  return {
    id: bill.id,
    no: bill.no,
    date: bill.date,
    party: bill.party,
    supplier: {
      gstin: supplier.gstin ?? "",
      address: supplier.address ?? "",
      code: supplier.code ?? "",
    },
    invNo: bill.invNo ?? "",
    invDate: bill.invDate ?? "",
    items: rawItems.map((it) => ({
      lotName: it.lotName ?? (it.lotId ? lotNames.get(it.lotId) : undefined) ?? "",
      description: it.description ?? "Ground Nuts",
      hsn: it.hsn ?? "12023090",
      bags: it.bags,
      kg: Number(it.kg),
      rate: Number(it.rate),
    })),
    pct: Number(bill.pct ?? 5),
    itcOn: bill.itcOn ?? true,
  };
}

const editSchema = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  party: z.string().trim().min(1).max(160),
  supplier: supplierSchema,
  invNo: z.string().trim().max(60).optional().default(""),
  invDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  items: z.array(itemSchema).min(1, "Add at least one line."),
  pct: z.number().min(0).max(100).default(5),
  firmCode: z.string().trim().max(5).optional().default(""),
  itcOn: z.boolean().default(true),
});

/**
 * Edit a GST purchase: supplier details, invoice no/date, item lines (typed
 * lot name, description, HSN, bags, weight, price — add/remove lines too),
 * GST % and ITC claim. Whether stock was added stays as originally recorded —
 * if this purchase added stock, its stock_in rows are rebuilt to match the
 * edited item lines (a new lot name creates that lot). Payments are
 * untouched — use the Payments recorded tab for those.
 */
export async function updateGstPurchase(
  input: z.input<typeof editSchema>,
): Promise<Result> {
  const session = await requireOwnerOrEditor();
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const bill = await db.query.pattiBills.findFirst({
    where: eq(schema.pattiBills.id, d.id),
  });
  if (!bill) return { ok: false, error: "GST purchase not found." };
  if (bill.kind !== "gstp") return { ok: false, error: "Not a GST purchase." };

  if (d.date !== bill.date) {
    const closedOld = await closedDateError(bill.date);
    if (closedOld) return { ok: false, error: closedOld };
  }
  const closedNew = await closedDateError(d.date);
  if (closedNew) return { ok: false, error: closedNew };

  const items = d.items.map((it) => ({ ...it, amount: r2(it.kg * it.rate) }));
  const taxable = r2(items.reduce((s, it) => s + it.amount, 0));
  const bags = items.reduce((s, it) => s + it.bags, 0);
  const kg = r2(items.reduce((s, it) => s + it.kg, 0));
  const rate = kg > 0 ? r2(taxable / kg) : 0;

  const intra =
    (d.firmCode ?? "").toString().trim() === (d.supplier.code ?? "").toString().trim();
  const totalTax = r2((taxable * d.pct) / 100);
  const cgst = intra ? r2(totalTax / 2) : 0;
  const sgst = intra ? r2(totalTax - cgst) : 0;
  const igst = intra ? 0 : totalTax;
  const preRound = r2(taxable + cgst + sgst + igst);
  const net = roundRupee(preRound);
  const roundOff = r2(net - preRound);
  const itc = d.itcOn ? totalTax : 0;
  // Rebuilt stock stays at the store this purchase belongs to.
  const loc = toLoc(bill.loc);

  try {
    await db.transaction(async (tx) => {
      // A purchase that added stock needs every line's lot to exist.
      const lotIds = await resolveLots(
        tx,
        items.map((it) => it.lotName),
        !!bill.stock,
        session.user.id,
      );
      const update: Record<string, unknown> = {
        party: d.party,
        bags,
        kg: kg.toString(),
        rate: rate.toString(),
        amount: taxable.toString(),
        net: net.toString(),
        supplier: d.supplier,
        invNo: d.invNo || null,
        invDate: d.invDate ?? null,
        items: items.map((it) => ({ ...it, lotId: lotIds.get(it.lotName) ?? null })),
        pct: d.pct.toString(),
        taxable: taxable.toString(),
        tax: { intra, pct: d.pct, cgst, sgst, igst, roundOff },
        itcOn: d.itcOn,
        itc: itc.toString(),
      };
      if (d.date !== bill.date) {
        update.date = d.date;
        update.fy = fyOf(d.date);
      }
      await tx.update(schema.pattiBills).set(update).where(eq(schema.pattiBills.id, d.id));

      if (bill.stock) {
        await tx
          .delete(schema.stockIn)
          .where(and(eq(schema.stockIn.src, "gstp"), eq(schema.stockIn.ref, d.id)));
        await tx.insert(schema.stockIn).values(
          items.map((it) => ({
            lotId: lotIds.get(it.lotName)!,
            bags: it.bags,
            date: d.date,
            loc: loc === "NM" ? "NM" : "MS",
            src: "gstp",
            ref: d.id,
            createdBy: session.user.id,
          })),
        );
      }
    });

    revalidatePath("/gstp");
    revalidatePath("/ledger");
    revalidatePath("/dashboard");
    revalidatePath("/stock");
    revalidatePath("/lots");
    return { ok: true, id: d.id, no: bill.no, fy: d.date !== bill.date ? fyOf(d.date) : bill.fy };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update the GST purchase.",
    };
  }
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
