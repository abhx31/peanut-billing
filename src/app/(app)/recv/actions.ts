"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwnerOrEditor, requireSession } from "@/lib/auth-helpers";
import { closedDateError } from "@/lib/year-close";
import { getCurrentLoc } from "@/lib/loc";
import { today } from "@/lib/format";

const addDueSchema = z.object({
  customer: z.string().trim().min(1).max(120),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(240).optional().default(""),
});

const editDueSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().positive(),
});

const delDueSchema = z.object({ id: z.string().uuid() });

const receiveDueSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().positive(),
  mode: z.enum(["Cash", "UPI", "CJ"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type Result = { ok: true } | { ok: false; error: string };

export async function addOldDue(input: z.input<typeof addDueSchema>): Promise<Result> {
  const session = await requireOwnerOrEditor();
  const parsed = addDueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the customer and amount." };

  await db.insert(schema.openingDues).values({
    customer: parsed.data.customer,
    amount: parsed.data.amount.toString(),
    date: parsed.data.date ?? today(),
    note: parsed.data.note || null,
    createdBy: session.user.id,
  });
  revalidatePath("/recv");
  revalidatePath("/balances");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function editOldDue(input: z.input<typeof editDueSchema>): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = editDueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid amount." };
  await db
    .update(schema.openingDues)
    .set({ amount: parsed.data.amount.toString() })
    .where(eq(schema.openingDues.id, parsed.data.id));
  revalidatePath("/recv");
  revalidatePath("/balances");
  return { ok: true };
}

export async function deleteOldDue(input: z.input<typeof delDueSchema>): Promise<Result> {
  await requireOwnerOrEditor();
  const parsed = delDueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id." };
  await db.delete(schema.openingDues).where(eq(schema.openingDues.id, parsed.data.id));
  revalidatePath("/recv");
  revalidatePath("/balances");
  return { ok: true };
}

export async function receiveOnDue(
  input: z.input<typeof receiveDueSchema>,
): Promise<Result> {
  const session = await requireSession();
  const parsed = receiveDueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid amount." };

  const due = await db.query.openingDues.findFirst({
    where: eq(schema.openingDues.id, parsed.data.id),
  });
  if (!due) return { ok: false, error: "Old due not found." };
  const closed = await closedDateError(parsed.data.date ?? today());
  if (closed) return { ok: false, error: closed };

  const loc = await getCurrentLoc();
  await db.insert(schema.openingPayments).values({
    openingDueId: due.id,
    customer: due.customer,
    loc: loc === "NM" ? "NM" : "MS",
    date: parsed.data.date ?? today(),
    mode: parsed.data.mode,
    amount: parsed.data.amount.toString(),
    createdBy: session.user.id,
  });
  revalidatePath("/recv");
  revalidatePath("/balances");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Receive a single lump sum from a customer. Applied to open dues first (oldest first),
 * then to that customer's unpaid bills in bill-number order.
 */
const receiveFromCustomerSchema = z.object({
  customer: z.string().trim().min(1),
  amount: z.number().positive(),
  mode: z.enum(["Cash", "UPI", "CJ"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function receiveFromCustomerV2(
  input: z.input<typeof receiveFromCustomerSchema>,
): Promise<Result> {
  const session = await requireSession();
  const parsed = receiveFromCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid amount." };

  const { customer, amount, mode } = parsed.data;
  const payDate = parsed.data.date ?? today();
  const closed = await closedDateError(payDate);
  if (closed) return { ok: false, error: closed };
  const loc = await getCurrentLoc();

  await db.transaction(async (tx) => {
    const openDues = await tx
      .select({
        id: schema.openingDues.id,
        amount: schema.openingDues.amount,
        date: schema.openingDues.date,
        createdAt: schema.openingDues.createdAt,
        paid: sql<string>`coalesce((select sum(amount) from opening_payments where opening_due_id = ${schema.openingDues.id}), 0)`,
      })
      .from(schema.openingDues)
      .where(
        sql`lower(trim(${schema.openingDues.customer})) = lower(trim(${customer}))`,
      )
      .orderBy(schema.openingDues.date, schema.openingDues.createdAt);

    let left = amount;
    for (const od of openDues) {
      if (left <= 0.005) break;
      const due = Number(od.amount) - Number(od.paid);
      if (due <= 0.005) continue;
      const take = Math.min(due, left);
      await tx.insert(schema.openingPayments).values({
        openingDueId: od.id,
        customer,
        loc: loc === "NM" ? "NM" : "MS",
        date: payDate,
        mode,
        amount: take.toString(),
        createdBy: session.user.id,
      });
      left -= take;
    }

    if (left > 0.005) {
      const bills = await tx
        .select({
          id: schema.bills.id,
          total: schema.bills.total,
          paid: sql<string>`coalesce((select sum(amount) from payments where bill_id = ${schema.bills.id}), 0)`,
        })
        .from(schema.bills)
        .where(
          sql`lower(trim(${schema.bills.customer})) = lower(trim(${customer}))`,
        )
        .orderBy(schema.bills.no);

      for (const b of bills) {
        if (left <= 0.005) break;
        const bdue = Number(b.total) - Number(b.paid);
        if (bdue <= 0.005) continue;
        const take = Math.min(bdue, left);
        await tx.insert(schema.payments).values({
          billId: b.id,
          date: payDate,
          mode,
          amount: take.toString(),
          createdBy: session.user.id,
        });
        left -= take;
      }
    }
  });

  revalidatePath("/recv");
  revalidatePath("/balances");
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}
