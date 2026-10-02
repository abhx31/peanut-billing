-- Introduces multi-lot bills via a bill_items table.
-- 1. Create bill_items.
-- 2. Migrate every existing bill's single lot into one bill_items row (no data loss).
-- 3. Drop the moved columns from bills.

CREATE TABLE "bill_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bill_id" uuid NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "lot_id" uuid NOT NULL,
  "lot_name_snapshot" text NOT NULL,
  "weights_text" text,
  "bags" integer NOT NULL,
  "kg" numeric(14, 3) NOT NULL,
  "rate" numeric(14, 2) NOT NULL,
  "amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint

ALTER TABLE "bill_items"
  ADD CONSTRAINT "bill_items_bill_id_bills_id_fk"
  FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "bill_items"
  ADD CONSTRAINT "bill_items_lot_id_lots_id_fk"
  FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "bill_items_bill_id_idx" ON "bill_items" ("bill_id");
--> statement-breakpoint

-- Move every existing bill's single-lot row into bill_items.
INSERT INTO "bill_items" ("bill_id", "position", "lot_id", "lot_name_snapshot", "weights_text", "bags", "kg", "rate", "amount")
SELECT "id", 0, "lot_id", "lot_name_snapshot", "weights_text", "bags", "kg", "rate", "amount"
FROM "bills"
WHERE "lot_id" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "bills" DROP CONSTRAINT IF EXISTS "bills_lot_id_lots_id_fk";
--> statement-breakpoint

ALTER TABLE "bills" DROP COLUMN "lot_id";
--> statement-breakpoint
ALTER TABLE "bills" DROP COLUMN "lot_name_snapshot";
--> statement-breakpoint
ALTER TABLE "bills" DROP COLUMN "weights_text";
--> statement-breakpoint
ALTER TABLE "bills" DROP COLUMN "bags";
--> statement-breakpoint
ALTER TABLE "bills" DROP COLUMN "kg";
--> statement-breakpoint
ALTER TABLE "bills" DROP COLUMN "rate";
