-- Q-21 (a), batch 1: the strategy centre's register of assumptions (company-wide, no project) and its change history.
-- Impact: expand-only. Five new enum types and two new, empty tables; no existing table, column, grant or row changes. The permission codes strategy.read,
-- strategy.manage and strategy.approve are catalogue rows the server upserts itself (no SQL here); the company owner receives them and the EXECUTIVE template
-- receives strategy.read through the existing template sync, with an audit row per company.
-- strategy_assumption_changes is append-only in the database: triggers refuse UPDATE, DELETE and TRUNCATE for every role (ENABLE ALWAYS), as on audit_logs.
-- The table owner can still drop a trigger: this is a guard against the application and injected statements, not a tamper-proof record.
-- Row-level security, the updated_at trigger and the column grants come from project_os_apply_conventions(), run after this file.
-- Rollback (no older code reads any of it): DROP TABLE "strategy_assumption_changes"; DROP TABLE "strategy_assumptions"; DROP FUNCTION project_os_append_only_refuse();
--   DROP TYPE "strategy_assumption_status", "strategy_assumption_review", "strategy_assumption_confidence", "strategy_assumption_source", "strategy_assumption_unit";
--   and remove the three strategy.* rows from permissions / role_permissions only if no role was granted them since.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_assumption_confidence" AS ENUM('high', 'medium', 'low'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_assumption_review" AS ENUM('monthly', 'quarterly', 'annual', 'event'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_assumption_source" AS ENUM('internal', 'external', 'management'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_assumption_status" AS ENUM('draft', 'pending', 'approved', 'retired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_assumption_unit" AS ENUM('percent', 'sar', 'months', 'days', 'count'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategy_assumptions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(200) NOT NULL,
	"unit" "strategy_assumption_unit" NOT NULL,
	"source_type" "strategy_assumption_source" NOT NULL,
	"source_note" varchar(500),
	"confidence" "strategy_assumption_confidence" NOT NULL,
	"review_frequency" "strategy_assumption_review" NOT NULL,
	"next_review_at" date,
	"status" "strategy_assumption_status" DEFAULT 'draft' NOT NULL,
	"value_conservative" numeric(18, 4) NOT NULL,
	"value_base" numeric(18, 4) NOT NULL,
	"value_optimistic" numeric(18, 4) NOT NULL,
	"proposed_conservative" numeric(18, 4),
	"proposed_base" numeric(18, 4),
	"proposed_optimistic" numeric(18, 4),
	"change_reason" varchar(500),
	"change_requested_by_user_id" integer,
	"created_by_user_id" integer NOT NULL,
	"submitted_by_user_id" integer,
	"approved_by_user_id" integer,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategy_assumptions_id_tenant_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategy_assumption_changes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"assumption_id" varchar(36) NOT NULL,
	"kind" varchar(30) NOT NULL,
	"previous_conservative" numeric(18, 4),
	"previous_base" numeric(18, 4),
	"previous_optimistic" numeric(18, 4),
	"new_conservative" numeric(18, 4),
	"new_base" numeric(18, 4),
	"new_optimistic" numeric(18, 4),
	"reason" varchar(500),
	"requested_by_user_id" integer,
	"decided_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_assumption_changes" ADD CONSTRAINT "strategy_assumption_changes_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_assumption_changes" ADD CONSTRAINT "strategy_assumption_changes_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_assumption_changes" ADD CONSTRAINT "strategy_assumption_changes_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_assumptions" ADD CONSTRAINT "strategy_assumptions_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_assumptions" ADD CONSTRAINT "strategy_assumptions_change_requested_by_user_id_users_id_fk" FOREIGN KEY ("change_requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_assumptions" ADD CONSTRAINT "strategy_assumptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_assumptions" ADD CONSTRAINT "strategy_assumptions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_assumptions" ADD CONSTRAINT "strategy_assumptions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_assumption_changes" ADD CONSTRAINT "strategy_assumption_changes_assumption_fk" FOREIGN KEY ("assumption_id","tenant_id") REFERENCES "public"."strategy_assumptions"("id","tenant_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategy_assumption_changes_tenant_assumption_idx" ON "strategy_assumption_changes" USING btree ("tenant_id","assumption_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "strategy_assumptions_tenant_code_unique" ON "strategy_assumptions" USING btree ("tenant_id","code");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION project_os_append_only_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is refused', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER strategy_assumption_changes_refuse_update BEFORE UPDATE ON strategy_assumption_changes FOR EACH ROW EXECUTE FUNCTION project_os_append_only_refuse();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER strategy_assumption_changes_refuse_delete BEFORE DELETE ON strategy_assumption_changes FOR EACH ROW EXECUTE FUNCTION project_os_append_only_refuse();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER strategy_assumption_changes_refuse_truncate BEFORE TRUNCATE ON strategy_assumption_changes FOR EACH STATEMENT EXECUTE FUNCTION project_os_append_only_refuse();
--> statement-breakpoint
ALTER TABLE strategy_assumption_changes ENABLE ALWAYS TRIGGER strategy_assumption_changes_refuse_update;
--> statement-breakpoint
ALTER TABLE strategy_assumption_changes ENABLE ALWAYS TRIGGER strategy_assumption_changes_refuse_delete;
--> statement-breakpoint
ALTER TABLE strategy_assumption_changes ENABLE ALWAYS TRIGGER strategy_assumption_changes_refuse_truncate;
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_append_only_refuse() FROM PUBLIC;
--> statement-breakpoint
-- refuse to finish without what the rules stand on: the same-company change key and the three refusing triggers, each set to fire always
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'strategy_assumption_changes_assumption_fk' AND contype = 'f' AND array_length(conkey, 1) = 2) THEN RAISE EXCEPTION '0040: the same-company change key is missing'; END IF;
  IF (SELECT COUNT(*) FROM pg_trigger WHERE tgrelid = 'strategy_assumption_changes'::regclass AND tgname LIKE 'strategy_assumption_changes_refuse_%' AND tgenabled = 'A') <> 3 THEN RAISE EXCEPTION '0040: the append-only triggers are missing'; END IF;
END $$;
