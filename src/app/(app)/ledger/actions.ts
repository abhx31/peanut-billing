"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwner } from "@/lib/auth-helpers";
import { getCurrentLoc } from "@/lib/loc";

const openingSchema = z.object({
  openingCash: z.number().min(0),
  openingBank: z.number().min(0),
});

type Result = { ok: true } | { ok: false; error: string };

export async function setOpeningBalances(
  input: z.input<typeof openingSchema>,
): Promise<Result> {
  await requireOwner();
  const parsed = openingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter valid amounts." };
  const loc = await getCurrentLoc();

  // Each store keeps its own opening cash/bank.
  const values =
    loc === "NM"
      ? {
          openingCashNm: parsed.data.openingCash.toString(),
          openingBankNm: parsed.data.openingBank.toString(),
        }
      : {
          openingCash: parsed.data.openingCash.toString(),
          openingBank: parsed.data.openingBank.toString(),
        };
  await db
    .insert(schema.settings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({
      target: schema.settings.id,
      set: { ...values, updatedAt: new Date() },
    });
  revalidatePath("/ledger");
  revalidatePath("/settings");
  return { ok: true };
}
