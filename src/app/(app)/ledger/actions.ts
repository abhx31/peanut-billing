"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwner } from "@/lib/auth-helpers";

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

  await db
    .update(schema.settings)
    .set({
      openingCash: parsed.data.openingCash.toString(),
      openingBank: parsed.data.openingBank.toString(),
      updatedAt: new Date(),
    })
    .where(eq(schema.settings.id, 1));
  revalidatePath("/ledger");
  revalidatePath("/settings");
  return { ok: true };
}
