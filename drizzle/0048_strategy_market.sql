-- Q-21 (a), batch 2: market study. A market indicator is an assumption of the «market» module; every assumption says how sure it is (confirmed /
-- estimate / analysis) and may name a source link next to its source note.
-- Impact: expand-only. Two new enum types, three new columns on strategy_assumptions (0037) with defaults ('general', 'estimate', NULL), and one index.
-- Existing rows become «general / estimate» with no link; nothing else changes. The table is new and small, so the ALTER is instant.
-- Rollback (no older code reads these columns): DROP INDEX "strategy_assumptions_tenant_module_idx"; ALTER TABLE "strategy_assumptions"
--   DROP COLUMN "evidence", DROP COLUMN "module", DROP COLUMN "source_url"; DROP TYPE "strategy_assumption_evidence", "strategy_assumption_module";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_assumption_evidence" AS ENUM('confirmed', 'estimate', 'analysis'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_assumption_module" AS ENUM('general', 'market'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "strategy_assumptions" ADD COLUMN IF NOT EXISTS "source_url" varchar(500);
--> statement-breakpoint
ALTER TABLE "strategy_assumptions" ADD COLUMN IF NOT EXISTS "module" "strategy_assumption_module" DEFAULT 'general' NOT NULL;
--> statement-breakpoint
ALTER TABLE "strategy_assumptions" ADD COLUMN IF NOT EXISTS "evidence" "strategy_assumption_evidence" DEFAULT 'estimate' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategy_assumptions_tenant_module_idx" ON "strategy_assumptions" USING btree ("tenant_id","module");
