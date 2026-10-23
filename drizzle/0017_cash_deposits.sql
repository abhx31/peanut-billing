-- Cash deposited into the bank: reduces Cash in hand, increases Bank/UPI, on
-- a given date. Deletable and editable like any other Daily ledger entry.

CREATE TABLE IF NOT EXISTS "cash_deposits" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "date" date NOT NULL,
    "amount" numeric(14, 2) NOT NULL,
    "note" text,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz NOT NULL DEFAULT now()
);
