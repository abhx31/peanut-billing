-- Two-step year close: an archive is first "pending" (owner checks it, nothing removed yet),
-- then "closed" once the owner confirms and its rows are removed.
ALTER TABLE "fy_archives" ADD COLUMN "status" text DEFAULT 'closed' NOT NULL;--> statement-breakpoint
ALTER TABLE "fy_archives" ADD COLUMN "removed_by" uuid;--> statement-breakpoint
ALTER TABLE "fy_archives" ADD COLUMN "removed_at" timestamp;--> statement-breakpoint
ALTER TABLE "fy_archives" ADD CONSTRAINT "fy_archives_removed_by_users_id_fk"
  FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
