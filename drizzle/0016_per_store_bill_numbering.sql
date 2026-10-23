-- Main store and New Mahavir get their own bill-number series (kind='normal'
-- and kind='psale' — the two bill kinds a customer-facing store issues).
-- Every past bill keeps its exact number. Main store's own numbering just
-- continues uninterrupted (it was always effectively the whole shared
-- sequence); New Mahavir gets a clean, independent 01/02/03… series starting
-- from today, since restarting it at 1 would collide with Main store's own
-- historical bill #1 if both tried to "restart" under the old shared
-- (kind, fy, no) uniqueness.

DROP INDEX IF EXISTS "bills_kind_fy_no_uq";
--> statement-breakpoint

CREATE UNIQUE INDEX "bills_kind_loc_fy_no_uq" ON "bills" USING btree (kind, COALESCE(loc, 'MS'), fy, no);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION next_bill_no_for_loc(p_fy text, p_kind text, p_loc text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_no integer;
  -- Cutover: bills dated/created before this point keep sharing Main store's
  -- numbering history (that's what they always were); New Mahavir's
  -- dedicated series only looks at rows created from this point on.
  v_cutover timestamptz := '2026-10-23 00:00:00+00';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bills_fy_loc:' || p_kind || ':' || p_loc || ':' || p_fy));
  IF p_loc = 'NM' THEN
    SELECT COALESCE(MAX(no), 0) + 1 INTO v_no
    FROM bills
    WHERE fy = p_fy AND kind = p_kind::bill_kind AND loc = 'NM' AND created_at >= v_cutover;
  ELSE
    SELECT COALESCE(MAX(no), 0) + 1 INTO v_no
    FROM bills
    WHERE fy = p_fy AND kind = p_kind::bill_kind AND COALESCE(loc, 'MS') = 'MS';
  END IF;
  RETURN v_no;
END;
$$;
