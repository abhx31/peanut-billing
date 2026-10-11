"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth-helpers";
import {
  FY_RE,
  confirmArchive,
  createArchive,
  discardArchive,
  nextFyToClose,
  previewYearClose,
  type CloseResult,
} from "@/lib/year-close";

const archiveSchema = z.object({
  fy: z.string().regex(FY_RE),
  cash: z.number().finite(),
  bank: z.number().finite(),
});

const fySchema = z.object({ fy: z.string().regex(FY_RE) });

type Result = { ok: true; result: CloseResult } | { ok: false; error: string };

async function checkInput(
  input: z.input<typeof archiveSchema>,
): Promise<{ ok: true; data: z.output<typeof archiveSchema> } | { ok: false; error: string }> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter cash in hand and bank balance." };
  const next = await nextFyToClose();
  if (!next || next.fy !== parsed.data.fy) {
    return { ok: false, error: "This financial year cannot be archived now. Refresh the page." };
  }
  if (!next.canClose) {
    return { ok: false, error: `${next.fy} can be archived after ${next.end}.` };
  }
  return { ok: true, data: parsed.data };
}

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

/** Runs the whole close, including the balance check, then rolls it back. */
export async function previewYearCloseAction(
  input: z.input<typeof archiveSchema>,
): Promise<Result> {
  const session = await requireOwner();
  const checked = await checkInput(input);
  if (!checked.ok) return checked;
  try {
    const result = await previewYearClose({ ...checked.data, userId: session.user.id });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Step 1: save the archive for checking. Nothing is removed. */
export async function createArchiveAction(
  input: z.input<typeof archiveSchema>,
): Promise<Result> {
  const session = await requireOwner();
  const checked = await checkInput(input);
  if (!checked.ok) return checked;
  try {
    const result = await createArchive({ ...checked.data, userId: session.user.id });
    revalidatePath("/settings");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Step 2: the owner has checked the archive; remove its rows from the live data. */
export async function confirmArchiveAction(input: {
  fy: string;
  confirm: string;
  checked: boolean;
}): Promise<Result> {
  const session = await requireOwner();
  const parsed = fySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid financial year." };
  const { fy } = parsed.data;
  if (!input.checked) return { ok: false, error: "Tick the box once you have checked the archive." };
  if (input.confirm.trim() !== fy) return { ok: false, error: `Type ${fy} to confirm.` };
  try {
    const result = await confirmArchive(fy, session.user.id);
    revalidatePath("/", "layout");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Throws away an archive that was not confirmed, so its year can be edited again. */
export async function discardArchiveAction(input: {
  fy: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireOwner();
  const parsed = fySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid financial year." };
  const done = await discardArchive(parsed.data.fy);
  if (!done) return { ok: false, error: "That archive was already confirmed or discarded." };
  revalidatePath("/settings");
  return { ok: true };
}
