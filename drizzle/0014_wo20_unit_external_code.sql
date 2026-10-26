-- Work order 20 (unit-completion matrix): the unit's ERP code (an Oracle code «zone-block-plot») is kept on the unit as its foreign key to the other system.
-- A nullable column on pmc_units plus a unique index inside a project where the code is present. Idempotent (a fresh database applies the baseline, which already holds this, then this file).
-- The column is mutable (a later report may add a code to an existing unit): the convention function grants UPDATE on every column except the immutable ones, so nothing to grant here.
-- Rollback: DROP INDEX pmc_units_project_external_code_unique; ALTER TABLE pmc_units DROP COLUMN external_code; (no other table is touched).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "pmc_units" ADD COLUMN IF NOT EXISTS "external_code" varchar(120);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_units_project_external_code_unique" ON "pmc_units" USING btree ("project_id","external_code") WHERE "pmc_units"."external_code" IS NOT NULL;
