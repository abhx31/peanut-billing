-- GST purchase bills live in patti_bills with kind='gstp' and get their own
-- 01..NN sequence per FY, independent of regular purchase patti (kind=null).
-- Add a kind-aware overload and keep the old single-arg function as a shim
-- that returns the "regular purchase patti" (kind IS NULL) next number.

CREATE OR REPLACE FUNCTION next_patti_no(p_fy text, p_kind text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_no integer;
  v_lock_key text;
BEGIN
  v_lock_key := 'patti_fy:' || p_fy || ':' || COALESCE(p_kind, '');
  PERFORM pg_advisory_xact_lock(hashtext(v_lock_key));
  IF p_kind IS NULL THEN
    SELECT COALESCE(MAX(no), 0) + 1 INTO v_no
      FROM patti_bills
      WHERE fy = p_fy AND kind IS NULL;
  ELSE
    SELECT COALESCE(MAX(no), 0) + 1 INTO v_no
      FROM patti_bills
      WHERE fy = p_fy AND kind = p_kind;
  END IF;
  RETURN v_no;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION next_patti_no(p_fy text) RETURNS integer
LANGUAGE plpgsql AS $$
BEGIN
  RETURN next_patti_no(p_fy, NULL);
END;
$$;
