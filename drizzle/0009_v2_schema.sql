-- v2 schema additions:
--   * bills: prev / paid_now snapshot columns (for "Previous balance" on new
--     bills) and a patti jsonb for sale-patti adjustments (cd, labour, etc.)
--   * bill_kind enum gains "psale" so a sale-patti is still a bills row.
--   * stock_in gains src / ref so GST-purchase and purchase-patti stock
--     additions can be deleted when their source doc is removed.
--   * patti_bills gets kind + GST-purchase columns (supplier snapshot,
--     invoice no/date, items, tax breakdown, ITC flag/value, add-to-stock).
--   * The patti_bills unique index now scopes by kind so purchase-patti and
--     GST-purchase can both start at 1 inside the same FY.

ALTER TYPE "public"."bill_kind" ADD VALUE IF NOT EXISTS 'psale';--> statement-breakpoint

ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "prev"     numeric(14,2);--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "paid_now" numeric(14,2);--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "patti"    jsonb;--> statement-breakpoint

ALTER TABLE "stock_in" ADD COLUMN IF NOT EXISTS "src" text;--> statement-breakpoint
ALTER TABLE "stock_in" ADD COLUMN IF NOT EXISTS "ref" uuid;--> statement-breakpoint

ALTER TABLE "patti_bills" ADD COLUMN IF NOT EXISTS "kind"      text;--> statement-breakpoint
ALTER TABLE "patti_bills" ADD COLUMN IF NOT EXISTS "supplier"  jsonb;--> statement-breakpoint
ALTER TABLE "patti_bills" ADD COLUMN IF NOT EXISTS "inv_no"    text;--> statement-breakpoint
ALTER TABLE "patti_bills" ADD COLUMN IF NOT EXISTS "inv_date"  date;--> statement-breakpoint
ALTER TABLE "patti_bills" ADD COLUMN IF NOT EXISTS "items"     jsonb;--> statement-breakpoint
ALTER TABLE "patti_bills" ADD COLUMN IF NOT EXISTS "pct"       numeric(5,2);--> statement-breakpoint
ALTER TABLE "patti_bills" ADD COLUMN IF NOT EXISTS "taxable"   numeric(14,2);--> statement-breakpoint
ALTER TABLE "patti_bills" ADD COLUMN IF NOT EXISTS "tax"       jsonb;--> statement-breakpoint
ALTER TABLE "patti_bills" ADD COLUMN IF NOT EXISTS "itc_on"    boolean;--> statement-breakpoint
ALTER TABLE "patti_bills" ADD COLUMN IF NOT EXISTS "itc"       numeric(14,2);--> statement-breakpoint
ALTER TABLE "patti_bills" ADD COLUMN IF NOT EXISTS "stock"     boolean;--> statement-breakpoint
ALTER TABLE "patti_bills" ADD COLUMN IF NOT EXISTS "stock_lot_id" uuid;--> statement-breakpoint

-- Replace the uniqueness scope so purchase patti and GST purchase each run
-- their own 01..NN sequence inside the same FY.
DROP INDEX IF EXISTS "patti_fy_no_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "patti_kind_fy_no_uq"
  ON "patti_bills" (COALESCE("kind", ''), "fy", "no");
