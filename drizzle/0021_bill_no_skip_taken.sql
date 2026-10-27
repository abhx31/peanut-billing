-- New Mahavir's own bill series (0016) restarts at 01 and only counts bills
-- created after the cutover, but the uniqueness rule (kind, store, fy, no)
-- also covers New Mahavir bills from before the cutover, which carry numbers
-- from the old shared series. The new series could hand out a number one of
-- those old bills already holds, and the bill failed to save. The next number
-- now skips any number already taken in that store's series.

CREATE OR REPLACE FUNCTION next_bill_no_for_loc(p_fy text, p_kind text, p_loc text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_no integer;
  -- Cutover: bills created before this point keep sharing Main store's
  -- numbering history; New Mahavir's dedicated series counts on from the
  -- rows created after it.
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
  -- Skip numbers an older bill of this store already holds.
  WHILE EXISTS (
    SELECT 1 FROM bills
    WHERE fy = p_fy AND kind = p_kind::bill_kind AND COALESCE(loc, 'MS') = p_loc AND no = v_no
  ) LOOP
    v_no := v_no + 1;
  END LOOP;
  RETURN v_no;
END;
$$;
