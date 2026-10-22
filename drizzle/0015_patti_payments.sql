-- Partial-payment ledger for purchases (regular Patti + GST Purchase, both
-- rows in patti_bills). Mirrors "payments" on the sales side — a purchase
-- bill can now be paid across several days and modes (Cash / UPI / CJ)
-- instead of one all-or-nothing paidMode/paidDate flag.

CREATE TABLE IF NOT EXISTS "patti_payments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "patti_id" uuid NOT NULL REFERENCES "patti_bills"("id") ON DELETE CASCADE,
    "date" date NOT NULL,
    "mode" "payment_mode" NOT NULL,
    "amount" numeric(14, 2) NOT NULL,
    "note" text,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Backfill: every bill already fully paid under the old single-shot flag
-- becomes one payment row for its full net amount, keeping the mode/date it
-- was originally recorded with.
INSERT INTO "patti_payments" ("patti_id", "date", "mode", "amount", "created_by", "created_at")
SELECT "id", "paid_date", "paid_mode"::"payment_mode", "net", "created_by", "created_at"
FROM "patti_bills"
WHERE "paid_mode" IS NOT NULL AND "paid_date" IS NOT NULL;
