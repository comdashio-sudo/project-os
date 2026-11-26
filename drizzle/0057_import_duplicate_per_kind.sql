-- Q-62 (the owner, 26-11, on production): «this file was already imported» refused the master plan's «update units from Excel» because the same villa file
-- had gone through the PMC villa-list import. The guard (one confirmed import of a file per company) was company-wide and blind to the kind of import and
-- the project, while its own message says «in this project». It is now per company, project and kind of import: the same file once per kind, per project.
-- Impact: the partial unique index keeps its name and its predicate (confirmed / importing / completed) and gains two columns, so it only relaxes the rule;
-- nothing is written. Built in this transaction (the table holds one row per import, small).
-- Rollback (written, not run): DROP INDEX "data_imports_tenant_file_hash_unique"; CREATE UNIQUE INDEX "data_imports_tenant_file_hash_unique" ON
--   "data_imports" ("tenant_id","file_hash") WHERE "status" IN ('confirmed', 'importing', 'completed'); — it FAILS once one file was confirmed under two kinds
--   or two projects of a company; those imports are legitimate and are not removed to make it pass (the reason this is not undone lightly).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DROP INDEX IF EXISTS "data_imports_tenant_file_hash_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_imports_tenant_file_hash_unique" ON "data_imports" USING btree ("tenant_id","project_id","module_code","file_hash") WHERE "data_imports"."status" IN ('confirmed', 'importing', 'completed');
