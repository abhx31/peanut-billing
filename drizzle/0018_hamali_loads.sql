-- Manual hamali entries for incoming loads (e.g. unloading a purchase) —
-- distinct from the automatic per-bill hamali on sale bills. Multiple per
-- day allowed (several loads can arrive the same day). Each links to an
-- expense row so it flows into Expenses / Daily ledger / profit exclusion
-- the same way the existing hamali_paid flow does.

CREATE TABLE IF NOT EXISTS "hamali_loads" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "date" date NOT NULL,
    "bags" integer NOT NULL,
    "rate_per_bag" numeric(10, 2) NOT NULL,
    "amount" numeric(14, 2) NOT NULL,
    "mode" "payment_mode" NOT NULL,
    "note" text,
    "expense_id" uuid NOT NULL REFERENCES "expenses"("id") ON DELETE CASCADE,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz NOT NULL DEFAULT now()
);
