-- Add location to stock_in so new stock can arrive at either Main store or New Mahavir.
-- Existing rows stay null (= Main store), matching historical behavior.
ALTER TABLE "stock_in" ADD COLUMN IF NOT EXISTS "loc" text;
