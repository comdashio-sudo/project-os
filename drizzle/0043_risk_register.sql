-- Q-27 (P-115): the project risk register — a review date, how and why a risk was closed, and the issue it became when it happened. Expand-only: four
-- nullable columns on "risks", no default, no change to an existing row (an open risk keeps no review date until someone sets one); the issue link points
-- at "issues" in the same company (the server writes both rows in one transaction, and RLS keeps either side to its company).
-- Rollback (no older code reads them): ALTER TABLE "risks" DROP COLUMN "issue_id"; ALTER TABLE "risks" DROP COLUMN "closure_reason";
--   ALTER TABLE "risks" DROP COLUMN "closed_at"; ALTER TABLE "risks" DROP COLUMN "next_review_at".
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "next_review_at" date;
--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "closure_reason" text;
--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "issue_id" varchar(36);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'risks_issue_id_issues_id_fk') THEN
    ALTER TABLE "risks" ADD CONSTRAINT "risks_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "issues"("id");
  END IF;
END $$;
