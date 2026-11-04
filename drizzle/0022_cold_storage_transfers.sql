-- Cold storage is a third place bags can sit. It has no bills, cash or books of
-- its own; bags only reach it (and leave it) by transfer. Transfers so far only
-- knew two directions (Main → New Mahavir "out" and back), so each one now
-- records where the bags came from and where they went: MS, NM or CS.

ALTER TABLE "transfers" ADD COLUMN "from_loc" text;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "to_loc" text;--> statement-breakpoint
UPDATE "transfers" SET
  "from_loc" = CASE WHEN "dir" = 'out' THEN 'MS' ELSE 'NM' END,
  "to_loc"   = CASE WHEN "dir" = 'out' THEN 'NM' ELSE 'MS' END;--> statement-breakpoint

-- A row written with only the old direction (a restored older backup, or the
-- previous app version for the minute a deploy takes) still gets its places.
CREATE OR REPLACE FUNCTION transfers_fill_locs() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.from_loc IS NULL AND NEW.dir IS NOT NULL THEN
    NEW.from_loc := CASE WHEN NEW.dir = 'out' THEN 'MS' ELSE 'NM' END;
  END IF;
  IF NEW.to_loc IS NULL AND NEW.dir IS NOT NULL THEN
    NEW.to_loc := CASE WHEN NEW.dir = 'out' THEN 'NM' ELSE 'MS' END;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER transfers_fill_locs BEFORE INSERT ON "transfers"
  FOR EACH ROW EXECUTE FUNCTION transfers_fill_locs();--> statement-breakpoint

ALTER TABLE "transfers" ALTER COLUMN "from_loc" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ALTER COLUMN "to_loc" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ALTER COLUMN "dir" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_locs_check"
  CHECK ("from_loc" IN ('MS', 'NM', 'CS') AND "to_loc" IN ('MS', 'NM', 'CS') AND "from_loc" <> "to_loc");
