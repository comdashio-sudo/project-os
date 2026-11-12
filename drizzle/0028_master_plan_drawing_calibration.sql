-- Q-7: the two-point calibration of a master-plan drawing (two points in the drawing's coordinates and the real distance in metres) and the size and page
-- a raster drawing was read at, so its picture lines up under the saved shapes after a reload. Expand-only: two nullable text columns holding JSON.
-- Grants and row-level security are unchanged (project_os_apply_conventions() runs after this file).
-- Rollback (no older code reads them): ALTER TABLE "master_plan_drawings" DROP COLUMN "calibration", DROP COLUMN "background";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "master_plan_drawings" ADD COLUMN IF NOT EXISTS "calibration" text;
--> statement-breakpoint
ALTER TABLE "master_plan_drawings" ADD COLUMN IF NOT EXISTS "background" text;
