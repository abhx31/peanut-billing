"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { requireOwner } from "@/lib/auth-helpers";

const settingsSchema = z.object({
  firm: z.string().trim().min(1).max(120),
  hamaliDefault: z.number().min(0),
  openingCash: z.number().min(0),
  openingBank: z.number().min(0),
});

const createStaffSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8).max(100),
});

const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8).max(100),
});

const deleteStaffSchema = z.object({ userId: z.string().uuid() });
const toggleDisabledSchema = z.object({
  userId: z.string().uuid(),
  disabled: z.boolean(),
});

type Result = { ok: true } | { ok: false; error: string };

export async function updateSettings(
  input: z.input<typeof settingsSchema>,
): Promise<Result> {
  await requireOwner();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check your inputs." };

  await db
    .update(schema.settings)
    .set({
      firm: parsed.data.firm,
      hamaliDefault: parsed.data.hamaliDefault.toString(),
      openingCash: parsed.data.openingCash.toString(),
      openingBank: parsed.data.openingBank.toString(),
      updatedAt: new Date(),
    })
    .where(eq(schema.settings.id, 1));

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/ledger");
  revalidatePath("/bills/new");
  return { ok: true };
}

export async function createStaff(
  input: z.input<typeof createStaffSchema>,
): Promise<Result> {
  await requireOwner();
  const parsed = createStaffSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Enter a name, valid email, and 8+ char password." };
  }

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, parsed.data.email),
  });
  if (existing) return { ok: false, error: "A user with that email already exists." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.insert(schema.users).values({
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash,
    role: "staff",
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function resetStaffPassword(
  input: z.input<typeof resetPasswordSchema>,
): Promise<Result> {
  const session = await requireOwner();
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Password must be at least 8 characters." };

  const target = await db.query.users.findFirst({
    where: eq(schema.users.id, parsed.data.userId),
  });
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === "owner" && target.id !== session.user.id) {
    return { ok: false, error: "You can only reset your own owner password here." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db
    .update(schema.users)
    .set({ passwordHash })
    .where(eq(schema.users.id, parsed.data.userId));
  revalidatePath("/settings");
  return { ok: true };
}

export async function setStaffDisabled(
  input: z.input<typeof toggleDisabledSchema>,
): Promise<Result> {
  const session = await requireOwner();
  const parsed = toggleDisabledSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  if (parsed.data.userId === session.user.id) {
    return { ok: false, error: "You cannot disable your own account." };
  }

  const target = await db.query.users.findFirst({
    where: eq(schema.users.id, parsed.data.userId),
  });
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === "owner") {
    return { ok: false, error: "Owner accounts cannot be disabled from here." };
  }

  await db
    .update(schema.users)
    .set({ disabled: parsed.data.disabled })
    .where(eq(schema.users.id, parsed.data.userId));
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteStaff(
  input: z.input<typeof deleteStaffSchema>,
): Promise<Result> {
  const session = await requireOwner();
  const parsed = deleteStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid user." };

  if (parsed.data.userId === session.user.id) {
    return { ok: false, error: "You cannot delete your own owner account." };
  }

  const target = await db.query.users.findFirst({
    where: eq(schema.users.id, parsed.data.userId),
  });
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === "owner") {
    return { ok: false, error: "Owner accounts cannot be deleted from here." };
  }

  await db
    .delete(schema.users)
    .where(and(eq(schema.users.id, parsed.data.userId), ne(schema.users.role, "owner")));
  revalidatePath("/settings");
  return { ok: true };
}
