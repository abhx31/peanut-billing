"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth-helpers";
import { today } from "@/lib/format";

const deleteBillSchema = z.object({ id: z.string().uuid() });
const receiveForBillSchema = z.object({
  billId: z.string().uuid(),
  amount: z.number().positive(),
  mode: z.enum(["Cash", "UPI"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type Result = { ok: true } | { ok: false; error: string };

export async function deleteBill(input: z.input<typeof deleteBillSchema>): Promise<Result> {
  await requireSession();
  const parsed = deleteBillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid bill id." };

  await db.delete(schema.bills).where(eq(schema.bills.id, parsed.data.id));
  revalidatePath("/day");
  revalidatePath("/balances");
  revalidatePath("/stock");
  revalidatePath("/ledger");
  revalidatePath("/profit");
  return { ok: true };
}

export async function receivePaymentForBill(
  input: z.input<typeof receiveForBillSchema>,
): Promise<Result> {
  const session = await requireSession();
  const parsed = receiveForBillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid amount." };

  await db.insert(schema.payments).values({
    billId: parsed.data.billId,
    amount: parsed.data.amount.toString(),
    mode: parsed.data.mode,
    date: parsed.data.date ?? today(),
    createdBy: session.user.id,
  });
  revalidatePath("/day");
  revalidatePath("/balances");
  revalidatePath("/ledger");
  return { ok: true };
}

const receiveFromCustomerSchema = z.object({
  customer: z.string().trim().min(1),
  amount: z.number().positive(),
  mode: z.enum(["Cash", "UPI"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// Applies the payment to this customer's oldest unpaid bills first.
export async function receiveFromCustomer(
  input: z.input<typeof receiveFromCustomerSchema>,
): Promise<Result> {
  const session = await requireSession();
  const parsed = receiveFromCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid amount." };

  const { customer, amount, mode, date } = parsed.data;
  const payDate = date ?? today();

  await db.transaction(async (tx) => {
    const bills = await tx
      .select({
        id: schema.bills.id,
        total: schema.bills.total,
        paid: sql<string>`coalesce((select sum(amount) from payments where bill_id = ${schema.bills.id}), 0)`,
      })
      .from(schema.bills)
      .where(sql`lower(trim(${schema.bills.customer})) = lower(trim(${customer}))`)
      .orderBy(asc(schema.bills.no));

    let left = amount;
    for (const b of bills) {
      if (left <= 0.005) break;
      const due = Number(b.total) - Number(b.paid);
      if (due <= 0.005) continue;
      const take = Math.min(due, left);
      await tx.insert(schema.payments).values({
        billId: b.id,
        amount: take.toString(),
        mode,
        date: payDate,
        createdBy: session.user.id,
      });
      left -= take;
    }
  });

  revalidatePath("/day");
  revalidatePath("/balances");
  revalidatePath("/ledger");
  return { ok: true };
}
