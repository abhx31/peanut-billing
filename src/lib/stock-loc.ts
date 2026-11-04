/**
 * Places bags can be: the two stores, plus Cold storage. Cold storage only
 * holds stock — bags reach it and leave it by transfer, and it has no bills,
 * cash or books of its own. (Safe to import from client components.)
 */
export const STOCK_LOCS = ["MS", "NM", "CS"] as const;
export type StockLoc = (typeof STOCK_LOCS)[number];

export function stockLocLabel(loc: StockLoc): string {
  return loc === "NM" ? "New Mahavir" : loc === "CS" ? "Cold storage" : "Main store";
}

export function stockLocShort(loc: StockLoc): string {
  return loc === "NM" ? "NM" : loc === "CS" ? "Cold" : "Main";
}
