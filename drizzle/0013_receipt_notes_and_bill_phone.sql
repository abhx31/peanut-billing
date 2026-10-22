-- Optional note on a receipt (shown next to the receive entry) and an
-- optional contact phone number on a bill (collected on the New Bill form).

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "note" text;
ALTER TABLE "opening_payments" ADD COLUMN IF NOT EXISTS "note" text;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "customer_phone" text;
