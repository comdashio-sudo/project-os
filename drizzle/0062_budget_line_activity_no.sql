-- Q-65: a budget line may carry the schedule activity number it belongs to (the owner's cost sheet has an «Activity No.» column). Optional text, nothing is linked or computed
-- from it yet: it is stored as written and shown beside the line in the planning page's cost tree.
-- Impact: expand-only. One nullable column on an existing table; no default, no rewrite, nothing existing changes.
-- Rollback (no older code reads it): ALTER TABLE "budget_lines" DROP COLUMN "activity_no";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS "activity_no" varchar(80);
