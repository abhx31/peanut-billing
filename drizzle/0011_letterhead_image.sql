-- Firm letterhead image for printed bills / patti / hamali / ledger. Stored
-- inline as a base64 data URL on settings. Users upload a JPEG/PNG through the
-- Settings form; it then prints as the top banner on every A5/A4 output.

ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "letterhead_image" text;
