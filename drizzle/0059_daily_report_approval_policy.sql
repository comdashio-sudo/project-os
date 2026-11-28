-- Q-71 (2) (the owner, 26-11: «why does the daily report wait for approval? it is just sent»): a company rule «daily reports need approval», off by default.
-- Off: sending a daily report makes it final (it enters the weekly and monthly reports at once and its progress lines move the villas' cells, as an approval
-- did); on: it waits for the project's approver, as before. A report that was waiting when the rule is off counts as sent in the figures (computed by the
-- readers — no report row is rewritten).
-- Impact: expand-only. One column with a default on an existing table; nothing existing is rewritten.
-- Rollback (no older code reads it): ALTER TABLE "tenant_policies" DROP COLUMN "daily_report_approval";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "tenant_policies" ADD COLUMN IF NOT EXISTS "daily_report_approval" boolean DEFAULT false NOT NULL;
