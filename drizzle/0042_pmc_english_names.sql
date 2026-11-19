-- Q-49: an optional English name beside the Arabic one for the PMC catalogue (group, stage, activity). Expand-only: three nullable columns, no default, no
-- change to codes, weights or relations; existing rows keep NULL and read their Arabic name. The Arabic name stays required (adviser decision 19-11).
-- Rollback (no older code reads them): ALTER TABLE "pmc_activity_definitions" DROP COLUMN "name_en"; ALTER TABLE "pmc_activity_stages" DROP COLUMN "name_en";
--   ALTER TABLE "pmc_activity_groups" DROP COLUMN "name_en".
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "pmc_activity_groups" ADD COLUMN IF NOT EXISTS "name_en" varchar(255);
--> statement-breakpoint
ALTER TABLE "pmc_activity_stages" ADD COLUMN IF NOT EXISTS "name_en" varchar(255);
--> statement-breakpoint
ALTER TABLE "pmc_activity_definitions" ADD COLUMN IF NOT EXISTS "name_en" varchar(255);
