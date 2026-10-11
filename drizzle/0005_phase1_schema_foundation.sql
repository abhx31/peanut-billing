-- Phase 1 of the inspiration-spec port: multi-store, CJ payment mode, editor role,
-- stock transfers, closings, CJ settlements, hamali paid, opening dues + payments,
-- GST customers, patti bills, GST fields on bills + bill_items, GST profile on settings.

-- 1) Enum extensions. Postgres requires each ADD VALUE in its own statement OUTSIDE a transaction;
--    drizzle-kit wraps the whole file so we use ALTER TYPE ... ADD VALUE IF NOT EXISTS which is txn-safe
--    on Postgres 12+. Safe to re-run.
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'editor';--> statement-breakpoint
ALTER TYPE "public"."payment_mode" ADD VALUE IF NOT EXISTS 'CJ';--> statement-breakpoint

-- 2) New enums.
CREATE TYPE "public"."bill_kind" AS ENUM('normal', 'gst');--> statement-breakpoint
CREATE TYPE "public"."xfer_dir" AS ENUM('out', 'back');--> statement-breakpoint

-- 3) Modify bills: add kind, loc, and GST invoice snapshot fields.
ALTER TABLE "bills" ADD COLUMN "kind" "bill_kind" NOT NULL DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "loc" text;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "gst_customer_id" uuid;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "buyer_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "consignee_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "seller_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "header_extras" jsonb;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "tax_breakdown" jsonb;--> statement-breakpoint

-- Switch unique index on (fy, no) to (kind, fy, no) so normal and GST bills number independently.
DROP INDEX IF EXISTS "bills_fy_no_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "bills_kind_fy_no_uq" ON "bills" USING btree ("kind","fy","no");--> statement-breakpoint

-- 4) Modify bill_items: GST line fields.
ALTER TABLE "bill_items" ADD COLUMN "hsn" text;--> statement-breakpoint
ALTER TABLE "bill_items" ADD COLUMN "description" text;--> statement-breakpoint

-- 5) Modify expenses: store tagging + hamali flag.
ALTER TABLE "expenses" ADD COLUMN "loc" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "is_hamali" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- 6) Settings: GST firm profile + GST starting invoice numbers per FY.
ALTER TABLE "settings" ADD COLUMN "gst_profile" jsonb;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "gst_start" jsonb;--> statement-breakpoint

-- 7) New tables.

CREATE TABLE "transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lot_id" uuid NOT NULL,
  "lot_name_snapshot" text NOT NULL,
  "bags" integer NOT NULL,
  "dir" "xfer_dir" NOT NULL,
  "date" date NOT NULL,
  "note" text,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_lot_id_lots_id_fk"
  FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfers_date_idx" ON "transfers" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transfers_lot_id_idx" ON "transfers" USING btree ("lot_id");--> statement-breakpoint

CREATE TABLE "opening_dues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer" text NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "date" date NOT NULL,
  "note" text,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "opening_dues" ADD CONSTRAINT "opening_dues_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "opening_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "opening_due_id" uuid NOT NULL,
  "customer" text NOT NULL,
  "loc" text,
  "date" date NOT NULL,
  "mode" "payment_mode" NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "opening_payments" ADD CONSTRAINT "opening_payments_opening_due_id_fk"
  FOREIGN KEY ("opening_due_id") REFERENCES "public"."opening_dues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_payments" ADD CONSTRAINT "opening_payments_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opening_payments_due_idx" ON "opening_payments" USING btree ("opening_due_id");--> statement-breakpoint

CREATE TABLE "gst_customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "gstin" text,
  "state" text,
  "state_code" text,
  "phone" text,
  "address" text,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "gst_customers" ADD CONSTRAINT "gst_customers_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "bills" ADD CONSTRAINT "bills_gst_customer_id_fk"
  FOREIGN KEY ("gst_customer_id") REFERENCES "public"."gst_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "closings" (
  "date" date PRIMARY KEY NOT NULL,
  "cash" numeric(14, 2),
  "bank" numeric(14, 2),
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "closings" ADD CONSTRAINT "closings_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "cj_settlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "date" date NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "mode" "payment_mode" NOT NULL,
  "note" text,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "cj_settlements" ADD CONSTRAINT "cj_settlements_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cj_settlements_date_idx" ON "cj_settlements" USING btree ("date");--> statement-breakpoint

CREATE TABLE "hamali_paid" (
  "date" date PRIMARY KEY NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "mode" "payment_mode" NOT NULL,
  "expense_id" uuid NOT NULL,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "hamali_paid" ADD CONSTRAINT "hamali_paid_expense_id_fk"
  FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hamali_paid" ADD CONSTRAINT "hamali_paid_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "patti_bills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "no" integer NOT NULL,
  "fy" text NOT NULL,
  "date" date NOT NULL,
  "party" text NOT NULL,
  "lot_name" text,
  "weights_text" text,
  "bags" integer NOT NULL,
  "kg" numeric(14, 3) NOT NULL,
  "rate" numeric(14, 2) NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "cd_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
  "cd" numeric(14, 2) DEFAULT '0' NOT NULL,
  "lab_rate" numeric(14, 2) DEFAULT '0' NOT NULL,
  "labor" numeric(14, 2) DEFAULT '0' NOT NULL,
  "br_rate" numeric(14, 2) DEFAULT '0' NOT NULL,
  "broker" numeric(14, 2) DEFAULT '0' NOT NULL,
  "br_sign" integer DEFAULT 1 NOT NULL,
  "transport" numeric(14, 2) DEFAULT '0' NOT NULL,
  "net" numeric(14, 2) NOT NULL,
  "paid_mode" text,
  "paid_date" date,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "patti_bills" ADD CONSTRAINT "patti_bills_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "patti_fy_no_uq" ON "patti_bills" USING btree ("fy","no");--> statement-breakpoint

-- 8) Extend next_bill_no() to be kind-aware so GST invoices number separately.
--    Older callers that passed only `fy` keep working via a wrapper.
CREATE OR REPLACE FUNCTION next_bill_no(p_fy text, p_kind text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_no integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bills_fy:' || p_kind || ':' || p_fy));
  SELECT COALESCE(MAX(no), 0) + 1 INTO v_no
  FROM bills
  WHERE fy = p_fy AND kind = p_kind::bill_kind;
  RETURN v_no;
END;
$$;
--> statement-breakpoint

-- Keep the single-argument signature as a thin wrapper over the new one so that
-- old server actions that already shipped (passing only fy) don't break at runtime.
CREATE OR REPLACE FUNCTION next_bill_no(p_fy text) RETURNS integer
LANGUAGE plpgsql AS $$
BEGIN
  RETURN next_bill_no(p_fy, 'normal');
END;
$$;
--> statement-breakpoint

-- Patti numbering uses the same locked-max pattern.
CREATE OR REPLACE FUNCTION next_patti_no(p_fy text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_no integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('patti_fy:' || p_fy));
  SELECT COALESCE(MAX(no), 0) + 1 INTO v_no FROM patti_bills WHERE fy = p_fy;
  RETURN v_no;
END;
$$;

-- GST invoice numbering: respects settings.gst_start[fy] floor when set by the owner.
CREATE OR REPLACE FUNCTION next_gst_invoice_no(p_fy text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_max integer;
  v_start integer;
  v_no integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('gst_fy:' || p_fy));
  SELECT COALESCE(MAX(no), 0) INTO v_max
  FROM bills WHERE fy = p_fy AND kind = 'gst';
  SELECT COALESCE((gst_start ->> p_fy)::integer, 0) INTO v_start
  FROM settings WHERE id = 1;
  v_no := GREATEST(v_max + 1, COALESCE(v_start, 1));
  RETURN v_no;
END;
$$;
