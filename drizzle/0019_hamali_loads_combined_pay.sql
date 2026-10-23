-- Hamali loads are no longer paid individually at entry time — they're
-- recorded (bags + rate only) and paid together with the day's loaded
-- (sale-bill) hamali in one combined payment at day's end, via hamali_paid.

ALTER TABLE "hamali_loads" DROP CONSTRAINT IF EXISTS "hamali_loads_expense_id_expenses_id_fk";
ALTER TABLE "hamali_loads" DROP COLUMN IF EXISTS "expense_id";
ALTER TABLE "hamali_loads" DROP COLUMN IF EXISTS "mode";

-- Any load entries already paid individually (and their linked expenses)
-- stay as-is in the expenses table — this only affects future entries.
