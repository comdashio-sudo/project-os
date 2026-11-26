-- Q-62 (the owner, 26-11, on production): the master plan did not see the project's villas. The «villa list» import writes PMC units (pmc_units); the master
-- plan's drawing links pointed only at units of a plan version (master_plan_spatial_entities), so a project whose villas came from the import had nothing
-- to link, colour or save, and the owner was asked to enter the same villas a second time. A link may now hold a PMC villa instead: one source of villas.
-- Impact: entity_id becomes nullable (relaxes a rule, writes nothing), one nullable column with a foreign key on (id, tenant, project) to pmc_units, a check
-- that a link holds exactly one of the two, and a unique index so a villa sits on one shape of a drawing. Existing links all have entity_id: none changes.
-- Row-level security, the updated_at trigger and the column grants come from project_os_apply_conventions(), run after this file.
-- Rollback (written, not run): DELETE FROM "master_plan_drawing_links" WHERE "pmc_unit_id" IS NOT NULL (each delete is a link a person confirmed: export
--   the drawing's links first); DROP INDEX "master_plan_drawing_links_drawing_pmc_unit_unique"; ALTER TABLE "master_plan_drawing_links"
--   DROP CONSTRAINT "master_plan_drawing_links_one_unit_check", DROP CONSTRAINT "mpdl_pmc_unit_fk", DROP COLUMN "pmc_unit_id", ALTER COLUMN "entity_id" SET NOT NULL.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "master_plan_drawing_links" ALTER COLUMN "entity_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "master_plan_drawing_links" ADD COLUMN IF NOT EXISTS "pmc_unit_id" varchar(36);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mpdl_pmc_unit_fk') THEN
    ALTER TABLE "master_plan_drawing_links" ADD CONSTRAINT "mpdl_pmc_unit_fk" FOREIGN KEY ("pmc_unit_id","tenant_id","project_id") REFERENCES "public"."pmc_units"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_plan_drawing_links_one_unit_check') THEN
    ALTER TABLE "master_plan_drawing_links" ADD CONSTRAINT "master_plan_drawing_links_one_unit_check" CHECK (("entity_id" IS NULL) <> ("pmc_unit_id" IS NULL));
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "master_plan_drawing_links_drawing_pmc_unit_unique" ON "master_plan_drawing_links" USING btree ("drawing_id","pmc_unit_id");
