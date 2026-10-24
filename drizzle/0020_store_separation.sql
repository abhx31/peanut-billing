-- Full store separation: Main store and New Mahavir run as two independent
-- books. Every money/stock record now belongs to one store, chosen by the
-- "Working at" toggle when it is entered. Bag transfers stay the only link.
--
-- Convention (same as bills/expenses/stock_in): loc NULL or 'MS' = Main
-- store, 'NM' = New Mahavir. Every existing row stays with Main store, except
-- old-due / advance rows whose receipts were all taken at New Mahavir.

-- 1. Old dues and "Advance received" markers.
ALTER TABLE "opening_dues" ADD COLUMN IF NOT EXISTS "loc" text;--> statement-breakpoint
UPDATE "opening_dues" d SET "loc" = 'NM'
WHERE EXISTS (SELECT 1 FROM "opening_payments" p WHERE p."opening_due_id" = d."id")
  AND NOT EXISTS (
    SELECT 1 FROM "opening_payments" p
    WHERE p."opening_due_id" = d."id" AND COALESCE(p."loc", 'MS') <> 'NM'
  );--> statement-breakpoint

-- 2. Day closings: one per store per day.
ALTER TABLE "closings" ADD COLUMN IF NOT EXISTS "loc" text NOT NULL DEFAULT 'MS';--> statement-breakpoint
ALTER TABLE "closings" DROP CONSTRAINT IF EXISTS "closings_pkey";--> statement-breakpoint
ALTER TABLE "closings" ADD CONSTRAINT "closings_date_loc_pk" PRIMARY KEY ("date", "loc");--> statement-breakpoint

-- 3. Hamali paid: one combined payment per store per day.
ALTER TABLE "hamali_paid" ADD COLUMN IF NOT EXISTS "loc" text NOT NULL DEFAULT 'MS';--> statement-breakpoint
ALTER TABLE "hamali_paid" DROP CONSTRAINT IF EXISTS "hamali_paid_pkey";--> statement-breakpoint
ALTER TABLE "hamali_paid" ADD CONSTRAINT "hamali_paid_date_loc_pk" PRIMARY KEY ("date", "loc");--> statement-breakpoint

-- 4. Plain per-row store tags.
ALTER TABLE "cj_settlements" ADD COLUMN IF NOT EXISTS "loc" text;--> statement-breakpoint
ALTER TABLE "cash_deposits" ADD COLUMN IF NOT EXISTS "loc" text;--> statement-breakpoint
ALTER TABLE "hamali_loads" ADD COLUMN IF NOT EXISTS "loc" text;--> statement-breakpoint
ALTER TABLE "patti_bills" ADD COLUMN IF NOT EXISTS "loc" text;--> statement-breakpoint

-- 5. Purchase patti / GST purchase numbering: a separate 01..NN series per
--    store. Every existing patti is Main store, so Main store's series just
--    continues and New Mahavir starts at 01.
DROP INDEX IF EXISTS "patti_kind_fy_no_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "patti_kind_loc_fy_no_uq"
  ON "patti_bills" (COALESCE("kind", ''), COALESCE("loc", 'MS'), "fy", "no");--> statement-breakpoint

CREATE OR REPLACE FUNCTION next_patti_no_for_loc(p_fy text, p_kind text, p_loc text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_no integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('patti_fy_loc:' || p_fy || ':' || COALESCE(p_kind, '') || ':' || p_loc)
  );
  SELECT COALESCE(MAX(no), 0) + 1 INTO v_no
  FROM patti_bills
  WHERE fy = p_fy
    AND COALESCE(kind, '') = COALESCE(p_kind, '')
    AND COALESCE(loc, 'MS') = p_loc;
  RETURN v_no;
END;
$$;--> statement-breakpoint

-- 6. New Mahavir's own opening cash / bank / CJ balances. The existing
--    opening_cash / opening_bank / cj_opening columns are Main store's.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "opening_cash_nm" numeric(14, 2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "opening_bank_nm" numeric(14, 2) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "cj_opening_nm" numeric(14, 2) NOT NULL DEFAULT '0';
