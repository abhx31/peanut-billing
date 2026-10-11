"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireSession, requireOwner } from "@/lib/auth-helpers";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  gstin: z.string().trim().max(20).optional().default(""),
  state: z.string().trim().max(80).optional().default(""),
  stateCode: z.string().trim().max(5).optional().default(""),
  phone: z.string().trim().max(32).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
});

const delSchema = z.object({ id: z.string().uuid() });

type Result = { ok: true; id?: string } | { ok: false; error: string };

export async function saveGstCustomer(
  input: z.input<typeof upsertSchema>,
): Promise<Result> {
  const session = await requireSession();
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a customer name." };

  const data = {
    name: parsed.data.name,
    gstin: parsed.data.gstin || null,
    state: parsed.data.state || null,
    stateCode: parsed.data.stateCode || null,
    phone: parsed.data.phone || null,
    address: parsed.data.address || null,
  };

  let id = parsed.data.id;
  if (id) {
    await db.update(schema.gstCustomers).set(data).where(eq(schema.gstCustomers.id, id));
  } else {
    const [row] = await db
      .insert(schema.gstCustomers)
      .values({ ...data, createdBy: session.user.id })
      .returning({ id: schema.gstCustomers.id });
    id = row.id;
  }
  revalidatePath("/gcust");
  revalidatePath("/gst");
  return { ok: true, id };
}

export async function deleteGstCustomer(
  input: z.input<typeof delSchema>,
): Promise<Result> {
  await requireOwner();
  const parsed = delSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id." };
  await db
    .delete(schema.gstCustomers)
    .where(eq(schema.gstCustomers.id, parsed.data.id));
  revalidatePath("/gcust");
  revalidatePath("/gst");
  return { ok: true };
}

// Firm GST profile (owner only).
const firmSchema = z.object({
  name: z.string().trim().max(160).optional().default(""),
  gstin: z.string().trim().max(20).optional().default(""),
  state: z.string().trim().max(80).optional().default(""),
  stateCode: z.string().trim().max(5).optional().default(""),
  fssai: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().max(160).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  bankHolder: z.string().trim().max(160).optional().default(""),
  bankName: z.string().trim().max(160).optional().default(""),
  bankAccount: z.string().trim().max(80).optional().default(""),
  bankIfsc: z.string().trim().max(80).optional().default(""),
  declaration: z.string().trim().max(1000).optional().default(""),
  nextInvoiceNo: z.number().int().min(1).optional(),
  fy: z.string().optional(),
});

export async function saveFirmGstProfile(
  input: z.input<typeof firmSchema>,
): Promise<Result> {
  await requireOwner();
  const parsed = firmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check inputs." };

  const [current] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, 1));

  const profile = {
    name: parsed.data.name || null,
    gstin: parsed.data.gstin || null,
    state: parsed.data.state || null,
    stateCode: parsed.data.stateCode || null,
    fssai: parsed.data.fssai || null,
    email: parsed.data.email || null,
    address: parsed.data.address || null,
    bankHolder: parsed.data.bankHolder || null,
    bankName: parsed.data.bankName || null,
    bankAccount: parsed.data.bankAccount || null,
    bankIfsc: parsed.data.bankIfsc || null,
    declaration: parsed.data.declaration || null,
  };

  const existingStart = (current?.gstStart as Record<string, number> | null) ?? {};
  const nextStart =
    parsed.data.nextInvoiceNo && parsed.data.fy
      ? { ...existingStart, [parsed.data.fy]: parsed.data.nextInvoiceNo }
      : existingStart;

  await db
    .update(schema.settings)
    .set({ gstProfile: profile, gstStart: nextStart, updatedAt: new Date() })
    .where(eq(schema.settings.id, 1));
  revalidatePath("/gst");
  revalidatePath("/gcust");
  revalidatePath("/settings");
  return { ok: true };
}
