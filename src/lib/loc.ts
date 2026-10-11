import { cookies } from "next/headers";

export type Loc = "MS" | "NM";
export const LOC_COOKIE = "loc";

/** Server-side: current "Working at" store from cookie. "MS" = Main store, "NM" = New Mahavir. */
export async function getCurrentLoc(): Promise<Loc> {
  const c = await cookies();
  const v = c.get(LOC_COOKIE)?.value;
  return v === "NM" ? "NM" : "MS";
}

export function locLabel(loc: Loc): string {
  return loc === "NM" ? "New Mahavir" : "Main store";
}

export function locSuffix(loc: Loc | null | undefined): string {
  return loc === "NM" ? " (New Mahavir)" : "";
}

/** Coerce a possibly-null DB value to a Loc (legacy NULL rows map to "MS"). */
export function toLoc(v: string | null | undefined): Loc {
  return v === "NM" ? "NM" : "MS";
}
