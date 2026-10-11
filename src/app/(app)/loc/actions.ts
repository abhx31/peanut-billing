"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOC_COOKIE, type Loc } from "@/lib/loc";
import { requireSession } from "@/lib/auth-helpers";

export async function setLoc(loc: Loc) {
  await requireSession();
  const c = await cookies();
  c.set(LOC_COOKIE, loc === "NM" ? "NM" : "", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    // One year
    maxAge: 60 * 60 * 24 * 365,
  });
  // Refresh every page that depends on the current store.
  revalidatePath("/", "layout");
  return { ok: true as const };
}
