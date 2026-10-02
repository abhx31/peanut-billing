-- Serialize bill-number allocation per financial year using a transaction-scoped
-- advisory lock. Combined with the unique index on (fy, no), this guarantees no
-- duplicate bill numbers even if two devices submit at the same instant.
CREATE OR REPLACE FUNCTION next_bill_no(p_fy text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_no integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bills_fy:' || p_fy));
  SELECT COALESCE(MAX(no), 0) + 1 INTO v_no FROM bills WHERE fy = p_fy;
  RETURN v_no;
END;
$$;

-- Singleton settings row with id = 1.
INSERT INTO settings (id, firm, hamali_default, opening_cash, opening_bank)
VALUES (1, 'Peanut Traders', 10, 0, 0)
ON CONFLICT (id) DO NOTHING;
