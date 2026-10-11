export type PageSize = "A4" | "A5";

export function parsePageSize(raw: string | undefined, fallback: PageSize): PageSize {
  const v = (raw ?? "").toUpperCase();
  return v === "A4" || v === "A5" ? v : fallback;
}

export function hasPageSize(raw: string | undefined): boolean {
  const v = (raw ?? "").toUpperCase();
  return v === "A4" || v === "A5";
}
