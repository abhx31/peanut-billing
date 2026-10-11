-- Wipe all business data from Peanut Billing while keeping user auth intact.
--
-- KEPT (so you stay logged in):
--   users, accounts, sessions, verification_tokens
--
-- WIPED (business data):
--   bills, bill_items, payments, lots, lot_costs, stock_in, transfers,
--   expenses, opening_dues, opening_payments, gst_customers, closings,
--   cj_settlements, hamali_paid, patti_bills, fy_archives, settings
--
-- Run inside a transaction so a mistake rolls back cleanly.
--
-- To run from psql:
--     psql "$DATABASE_URL" -f scripts/clean-db.sql
--
-- Or paste the TRUNCATE statement into the Neon SQL editor.

BEGIN;

TRUNCATE TABLE
  fy_archives,
  closings,
  hamali_paid,
  cj_settlements,
  opening_payments,
  opening_dues,
  payments,
  bill_items,
  bills,
  patti_bills,
  expenses,
  transfers,
  stock_in,
  lot_costs,
  lots,
  gst_customers,
  settings
RESTART IDENTITY CASCADE;

COMMIT;

-- Sanity check: counts after cleanup.
SELECT 'users'         AS table, COUNT(*) FROM users
UNION ALL SELECT 'accounts',       COUNT(*) FROM accounts
UNION ALL SELECT 'sessions',       COUNT(*) FROM sessions
UNION ALL SELECT 'bills',          COUNT(*) FROM bills
UNION ALL SELECT 'bill_items',     COUNT(*) FROM bill_items
UNION ALL SELECT 'payments',       COUNT(*) FROM payments
UNION ALL SELECT 'lots',           COUNT(*) FROM lots
UNION ALL SELECT 'stock_in',       COUNT(*) FROM stock_in
UNION ALL SELECT 'transfers',      COUNT(*) FROM transfers
UNION ALL SELECT 'expenses',       COUNT(*) FROM expenses
UNION ALL SELECT 'patti_bills',    COUNT(*) FROM patti_bills
UNION ALL SELECT 'hamali_paid',    COUNT(*) FROM hamali_paid
UNION ALL SELECT 'cj_settlements', COUNT(*) FROM cj_settlements
UNION ALL SELECT 'opening_dues',   COUNT(*) FROM opening_dues
UNION ALL SELECT 'opening_payments', COUNT(*) FROM opening_payments
UNION ALL SELECT 'gst_customers',  COUNT(*) FROM gst_customers
UNION ALL SELECT 'closings',       COUNT(*) FROM closings
UNION ALL SELECT 'fy_archives',    COUNT(*) FROM fy_archives
UNION ALL SELECT 'settings',       COUNT(*) FROM settings
UNION ALL SELECT 'lot_costs',      COUNT(*) FROM lot_costs
ORDER BY 1;
