-- Q-58 (1): more than one daily report per person per day (the owner's decision, 25-11: «not one report per person»). The index that held one report per
-- engineer, project, day (and contractor of the old sheet) goes; a report of the same day is told apart by an optional label (shift, area or contractor), and
-- every report keeps its own number. A save sent twice (a phone that was offline) is already answered once by client_requests (withClientRequest): no second draft.
-- Impact: one unique index dropped (relaxes a rule, writes nothing), a plain index on (project, day) for the reads that looked through it, one nullable column.
-- Row-level security, the updated_at trigger and the column grants come from project_os_apply_conventions(), run after this file.
-- Rollback (written, not run): DROP INDEX "site_daily_reports_project_date_idx"; ALTER TABLE "site_daily_reports" DROP COLUMN "label";
--   CREATE UNIQUE INDEX "site_daily_reports_project_date_preparer_unique" ON "site_daily_reports" ("project_id","report_date","prepared_by_user_id",coalesce("contractor_id", ''));
--   — the last statement FAILS once a person has two reports of one day; those must be merged or removed by hand first (the reason this is not undone lightly).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DROP INDEX IF EXISTS "site_daily_reports_project_date_preparer_unique";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_daily_reports_project_date_idx" ON "site_daily_reports" USING btree ("project_id","report_date");
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "label" varchar(120);

