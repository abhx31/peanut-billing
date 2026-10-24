import { cookies } from "next/headers";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

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

/**
 * SQL condition: the row's store column equals `loc`. Legacy NULL counts as
 * Main store. Each store is a separate set of books — every money/stock query
 * filters through this.
 */
export function atLoc(col: SQLWrapper, loc: Loc): SQL {
  return sql`coalesce(${col}, 'MS') = ${loc}`;
}

/** The store's own opening balances from the settings row. */
export function openingsFor(
  settings: {
    openingCash: string;
    openingBank: string;
    cjOpening: string;
    openingCashNm?: string | null;
    openingBankNm?: string | null;
    cjOpeningNm?: string | null;
  },
  loc: Loc,
): { cash: number; bank: number; cj: number } {
  return loc === "NM"
    ? {
        cash: Number(settings.openingCashNm ?? 0),
        bank: Number(settings.openingBankNm ?? 0),
        cj: Number(settings.cjOpeningNm ?? 0),
      }
    : {
        cash: Number(settings.openingCash ?? 0),
        bank: Number(settings.openingBank ?? 0),
        cj: Number(settings.cjOpening ?? 0),
      };
}
