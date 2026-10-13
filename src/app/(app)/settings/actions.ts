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
  letterheadImage: z
    .string()
    .max(2_000_000) // ~1.5 MB raw image after base64 overhead
    .nullable()
    .optional(),
});

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8).max(100),
  role: z.enum(["owner", "editor", "staff"]).default("staff"),
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

  const lh = parsed.data.letterheadImage;
  // undefined = form didn't send the field → leave as-is; "" = explicit clear.
  const updateSet: Record<string, unknown> = {
    firm: parsed.data.firm,
    hamaliDefault: parsed.data.hamaliDefault.toString(),
    openingCash: parsed.data.openingCash.toString(),
    openingBank: parsed.data.openingBank.toString(),
    updatedAt: new Date(),
  };
  if (lh !== undefined) updateSet.letterheadImage = lh === "" ? null : lh;

  await db
    .insert(schema.settings)
    .values({
      id: 1,
      firm: parsed.data.firm,
      hamaliDefault: parsed.data.hamaliDefault.toString(),
      openingCash: parsed.data.openingCash.toString(),
      openingBank: parsed.data.openingBank.toString(),
      letterheadImage: lh && lh !== "" ? lh : null,
    })
    .onConflictDoUpdate({
      target: schema.settings.id,
      set: updateSet,
    });

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/ledger");
  revalidatePath("/bills/new");
  return { ok: true };
}

export async function createUser(
  input: z.input<typeof createUserSchema>,
): Promise<Result> {
  await requireOwner();
  const parsed = createUserSchema.safeParse(input);
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
    role: parsed.data.role,
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
  // Any owner can reset any other user's password (including other owners).
  void session;

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
