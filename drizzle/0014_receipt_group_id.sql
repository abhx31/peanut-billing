-- Groups every payments/opening_payments row created by one Receive click
-- together, so statements can show "Received ₹1,00,000 on 12-Oct" as a single
-- line instead of the per-bill split it was allocated across.

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "receipt_group_id" uuid;
ALTER TABLE "opening_payments" ADD COLUMN IF NOT EXISTS "receipt_group_id" uuid;
