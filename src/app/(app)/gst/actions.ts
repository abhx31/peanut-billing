"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { fyOf, r2 } from "@/lib/format";
import type {
  GstHeaderExtras,
  GstProfile,
  GstTaxBreakdown,
  PartySnapshot,
} from "@/lib/gst-types";

const itemSchema = z.object({
  lotId: z.string().uuid(),
  description: z.string().trim().max(160).default("Ground Nuts"),
  hsn: z.string().trim().max(16).default("12023090"),
  weightsText: z.string().trim().max(500).optional().default(""),
  bags: z.number().int().positive(),
  kg: z.number().positive(),
  rate: z.number().min(0),
  amountOverride: z.number().min(0).optional(),
});

const saveGstBillSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  buyerId: z.string().uuid(),
  consigneeId: z.string().uuid().optional(),
  gstPercent: z.number().min(0).max(28),
  items: z.array(itemSchema).min(1),
  header: z.object({
    ewb: z.string().trim().max(80).optional().default(""),
    veh: z.string().trim().max(80).optional().default(""),
    through: z.string().trim().max(80).optional().default("Self"),
    destination: z.string().trim().max(120).optional().default(""),
    dn: z.string().trim().max(80).optional().default(""),
    mp: z.string().trim().max(80).optional().default(""),
    rf: z.string().trim().max(120).optional().default(""),
    or: z.string().trim().max(120).optional().default(""),
    bo: z.string().trim().max(80).optional().default(""),
    bd: z.string().trim().max(80).optional().default(""),
    dd: z.string().trim().max(80).optional().default(""),
    dt: z.string().trim().max(80).optional().default(""),
    lr: z.string().trim().max(120).optional().default(""),
    td: z.string().trim().max(120).optional().default(""),
  }),
  payCash: z.number().min(0).default(0),
  payUpi: z.number().min(0).default(0),
  payCj: z.number().min(0).default(0),
});

type Result =
  | { ok: true; billId: string; no: number; fy: string }
  | { ok: false; error: string };

export async function saveGstBill(
  input: z.input<typeof saveGstBillSchema>,
): Promise<Result> {
  const session = await requireSession();
  const parsed = saveGstBillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;
  const closed = await closedDateError(d.date);
  if (closed) return { ok: false, error: closed };
  const fy = fyOf(d.date);

  const buyer = await db.query.gstCustomers.findFirst({
    where: eq(schema.gstCustomers.id, d.buyerId),
  });
  if (!buyer) return { ok: false, error: "Buyer (GST customer) not found." };

  let consignee = buyer;
  if (d.consigneeId && d.consigneeId !== d.buyerId) {
    const other = await db.query.gstCustomers.findFirst({
      where: eq(schema.gstCustomers.id, d.consigneeId),
    });
    if (!other) return { ok: false, error: "Consignee not found." };
    consignee = other;
  }

  const settingsRow = await db.query.settings.findFirst();
  const profile = (settingsRow?.gstProfile ?? null) as GstProfile | null;
  if (!profile || !profile.name) {
    return {
      ok: false,
      error: "Fill your firm's GST profile first (GST customers tab).",
    };
  }

  const items = d.items.map((it) => ({
    ...it,
    amount:
      it.amountOverride !== undefined && it.amountOverride > 0
        ? r2(it.amountOverride)
        : r2(it.kg * it.rate),
  }));

  const totalBags = items.reduce((s, it) => s + it.bags, 0);
  const taxable = r2(items.reduce((s, it) => s + it.amount, 0));
  const intra =
    (profile.stateCode ?? "").toString().trim() ===
    (buyer.stateCode ?? "").toString().trim();
  const taxTotal = r2((taxable * d.gstPercent) / 100);
  const cgst = intra ? r2(taxTotal / 2) : 0;
  const sgst = intra ? r2(taxTotal - cgst) : 0;
  const igst = intra ? 0 : taxTotal;
  const preRound = r2(taxable + cgst + sgst + igst);
  const total = Math.round(preRound);
  const roundOff = r2(total - preRound);
  const taxBreakdown: GstTaxBreakdown = {
    intra,
    pct: d.gstPercent,
    taxable,
    cgst: intra ? cgst : undefined,
    sgst: intra ? sgst : undefined,
    igst: intra ? undefined : igst,
    roundOff,
  };

  const buyerSnap: PartySnapshot = {
    name: buyer.name,
    gstin: buyer.gstin,
    state: buyer.state,
    stateCode: buyer.stateCode,
    phone: buyer.phone,
    address: buyer.address,
  };
  const consigneeSnap: PartySnapshot = {
    name: consignee.name,
    gstin: consignee.gstin,
    state: consignee.state,
    stateCode: consignee.stateCode,
    phone: consignee.phone,
    address: consignee.address,
  };
  const sellerSnap: GstProfile = { ...profile };
  const headerExtras: GstHeaderExtras = {
    ewb: d.header.ewb || undefined,
    veh: d.header.veh || undefined,
    through: d.header.through || undefined,
    destination: d.header.destination || undefined,
    dn: d.header.dn || undefined,
    mp: d.header.mp || undefined,
    rf: d.header.rf || undefined,
    or: d.header.or || undefined,
    bo: d.header.bo || undefined,
    bd: d.header.bd || undefined,
    dd: d.header.dd || undefined,
    dt: d.header.dt || undefined,
    lr: d.header.lr || undefined,
    td: d.header.td || undefined,
  };

  try {
    const result = await db.transaction(async (tx) => {
      const noRes = await tx.execute<{ no: number }>(
        sql`select next_gst_invoice_no(${fy}) as no`,
      );
      const no = noRes.rows[0].no;

      const lotIds = Array.from(new Set(items.map((i) => i.lotId)));
      const lots = await tx
        .select()
        .from(schema.lots)
        .where(inArray(schema.lots.id, lotIds));
      const lotMap = new Map(lots.map((l) => [l.id, l]));

      const [bill] = await tx
        .insert(schema.bills)
        .values({
          kind: "gst",
          no,
          fy,
          date: d.date,
          customer: buyer.name,
          loc: null,
          hamaliPerBag: "0",
          hamali: "0",
          gstPercent: d.gstPercent.toString(),
          gst: taxTotal.toString(),
          amount: taxable.toString(),
          total: total.toString(),
          gstCustomerId: buyer.id,
          buyerSnapshot: buyerSnap,
          consigneeSnapshot: consigneeSnap,
          sellerSnapshot: sellerSnap,
          headerExtras: headerExtras,
          taxBreakdown: taxBreakdown,
          createdBy: session.user.id,
        })
        .returning({ id: schema.bills.id });

      await tx.insert(schema.billItems).values(
        items.map((it, idx) => ({
          billId: bill.id,
          position: idx,
          lotId: it.lotId,
          lotNameSnapshot: lotMap.get(it.lotId)?.name ?? "",
          weightsText: it.weightsText || null,
          bags: it.bags,
          kg: it.kg.toString(),
          rate: it.rate.toString(),
          amount: it.amount.toString(),
          hsn: it.hsn,
          description: it.description,
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

      void totalBags;
      return { billId: bill.id, no };
    });

    revalidatePath("/gst");
    revalidatePath("/day");
    revalidatePath("/dashboard");
    revalidatePath("/stock");
    revalidatePath("/balances");
    return { ok: true, billId: result.billId, no: result.no, fy };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save the GST invoice.",
    };
  }
}
