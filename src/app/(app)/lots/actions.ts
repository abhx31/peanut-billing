"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwner, requireSession } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { getCurrentLoc } from "@/lib/loc";
import { today } from "@/lib/format";

const addLotSchema = z.object({
  name: z.string().trim().min(1).max(120),
  bags: z.number().int().min(0),
  costPerKg: z.number().min(0).nullable(),
});

const addBagsSchema = z.object({
  lotId: z.string().uuid(),
  bags: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const setCostSchema = z.object({
  lotId: z.string().uuid(),
  costPerKg: z.number().min(0),
});

const deleteLotSchema = z.object({ lotId: z.string().uuid() });

const renameLotSchema = z.object({
  lotId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

type Result = { ok: true } | { ok: false; error: string };

export async function addLot(input: z.input<typeof addLotSchema>): Promise<
  Result & { lotId?: string }
> {
  const session = await requireSession();
  const parsed = addLotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form inputs." };

  const { name, bags, costPerKg } = parsed.data;
  const isOwner = session.user.role === "owner";
  const loc = await getCurrentLoc();

  const lotId = await db.transaction(async (tx) => {
    const [lot] = await tx
      .insert(schema.lots)
      .values({ name, createdBy: session.user.id })
      .returning({ id: schema.lots.id });

    if (bags > 0) {
      await tx.insert(schema.stockIn).values({
        lotId: lot.id,
        bags,
        date: today(),
        loc: loc === "NM" ? "NM" : "MS",
        createdBy: session.user.id,
      });
    }
    if (isOwner && costPerKg !== null && costPerKg > 0) {
      await tx.insert(schema.lotCosts).values({
        lotId: lot.id,
        costPerKg: costPerKg.toString(),
      });
    }
    return lot.id;
  });

  revalidatePath("/lots");
  revalidatePath("/bills/new");
  revalidatePath("/stock");
  return { ok: true, lotId };
}

export async function addBags(input: z.input<typeof addBagsSchema>): Promise<Result> {
  const session = await requireSession();
  const parsed = addBagsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a positive number of bags." };
  const closed = await closedDateError(parsed.data.date ?? today());
  if (closed) return { ok: false, error: closed };
  const loc = await getCurrentLoc();

  await db.insert(schema.stockIn).values({
    lotId: parsed.data.lotId,
    bags: parsed.data.bags,
    date: parsed.data.date ?? today(),
    loc: loc === "NM" ? "NM" : "MS",
    createdBy: session.user.id,
  });
  revalidatePath("/lots");
  revalidatePath("/stock");
  revalidatePath("/bills/new");
  return { ok: true };
}

export async function setLotCost(input: z.input<typeof setCostSchema>): Promise<Result> {
  await requireOwner();
  const parsed = setCostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid cost." };

  await db
    .insert(schema.lotCosts)
    .values({
      lotId: parsed.data.lotId,
      costPerKg: parsed.data.costPerKg.toString(),
    })
    .onConflictDoUpdate({
      target: schema.lotCosts.lotId,
      set: {
        costPerKg: parsed.data.costPerKg.toString(),
        updatedAt: new Date(),
      },
    });
  revalidatePath("/lots");
  revalidatePath("/profit");
  return { ok: true };
}

export async function renameLot(input: z.input<typeof renameLotSchema>): Promise<Result> {
  await requireSession();
  const parsed = renameLotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid lot name." };

  // Only the live lot name changes. Past bills keep their own lotNameSnapshot,
  // so old prints and records are unaffected — this is purely a go-forward label.
  await db
    .update(schema.lots)
    .set({ name: parsed.data.name })
    .where(eq(schema.lots.id, parsed.data.lotId));
  revalidatePath("/lots");
  revalidatePath("/bills/new");
  revalidatePath("/stock");
  revalidatePath("/patti");
  return { ok: true };
}

export async function deleteLot(input: z.input<typeof deleteLotSchema>): Promise<Result> {
  await requireSession();
  const parsed = deleteLotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid lot." };

  await db
    .update(schema.lots)
    .set({ deletedAt: new Date() })
    .where(eq(schema.lots.id, parsed.data.lotId));
  revalidatePath("/lots");
  revalidatePath("/bills/new");
  revalidatePath("/stock");
  return { ok: true };
}

// Helper used by the Daily summary & Stock pages to show counts quickly.
export async function stockInSumOnDate(date: string) {
  const [row] = await db
    .select({ s: sql<string>`coalesce(sum(${schema.stockIn.bags}), 0)` })
    .from(schema.stockIn)
    .where(eq(schema.stockIn.date, date));
  return Number(row?.s ?? 0);
}
