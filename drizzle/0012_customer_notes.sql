-- Per-customer sticky notes shown on the Balances page. Keyed by customer_key
-- (lowercased, whitespace-collapsed customer name) so it survives casing /
-- spacing differences in how a name is typed across bills.

CREATE TABLE IF NOT EXISTS "customer_notes" (
    "customer_key" text PRIMARY KEY,
    "note" text NOT NULL,
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);
