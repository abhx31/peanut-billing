-- Year-end close: closed financial years are archived (gzipped JSON) and their settled rows removed.
-- Money still owed (unpaid bills, old dues, unpaid patti) stays live; running totals are carried forward.

-- CJ money held = cj_opening + CJ receipts − CJ settlements. Year close moves the archived part here.
ALTER TABLE "settings" ADD COLUMN "cj_opening" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint

CREATE TABLE "fy_archives" (
  "fy" text PRIMARY KEY NOT NULL,
  "counts" jsonb NOT NULL,
  "summary" jsonb NOT NULL,
  "raw_bytes" integer NOT NULL,
  "data" bytea NOT NULL,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "fy_archives" ADD CONSTRAINT "fy_archives_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
