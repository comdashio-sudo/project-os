-- Q-60 (the owner's villa register, 26-11): each villa's construction phase (PH1–PH4, every block in one phase), its package (Gold / Diamond, following the
-- model) and whether it is a mock-up villa. Read from the villa list's own columns, shown on the villa card, and the phase is a way to choose villas.
-- Impact: expand-only. Three nullable columns and one index on (tenant, project, phase); nothing existing changes.
-- Row-level security, the updated_at trigger and the column grants come from project_os_apply_conventions(), run after this file.
-- Rollback (no older code reads them): DROP INDEX "pmc_units_tenant_project_phase_idx"; ALTER TABLE "pmc_units" DROP COLUMN "is_mockup", DROP COLUMN "package", DROP COLUMN "phase";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "pmc_units" ADD COLUMN IF NOT EXISTS "phase" varchar(40);
--> statement-breakpoint
ALTER TABLE "pmc_units" ADD COLUMN IF NOT EXISTS "package" varchar(40);
--> statement-breakpoint
ALTER TABLE "pmc_units" ADD COLUMN IF NOT EXISTS "is_mockup" boolean;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_units_tenant_project_phase_idx" ON "pmc_units" USING btree ("tenant_id","project_id","phase");
