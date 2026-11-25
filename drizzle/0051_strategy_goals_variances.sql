-- Q-21 (a), batch 6 (unit 5): goals, initiatives and variances (company-wide, no project). A variance sets an assumption against what happened and records
-- the decision it calls for; a goal is a separate record that a variance never changes.
-- Impact: expand-only. Three enum types and three new, empty tables; nothing existing changes. Every link (goal → assumption, initiative → goal,
-- variance → assumption / initiative) is a composite foreign key with tenant_id, so no row points into another company. CHECKs keep the period in order,
-- the sample size non-negative and a decision whole (an initiative decision names its initiative; an undecided variance names no decider).
-- Row-level security, the updated_at trigger and the column grants come from project_os_apply_conventions(), run after this file.
-- Rollback (no older code reads any of it): DROP TABLE "strategy_variances"; DROP TABLE "strategy_initiatives"; DROP TABLE "strategy_goals";
--   DROP TYPE "strategy_variance_decision"; DROP TYPE "strategy_initiative_status"; DROP TYPE "strategy_goal_status";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_goal_status" AS ENUM('active', 'achieved', 'retired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_initiative_status" AS ENUM('planned', 'in_progress', 'done', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_variance_decision" AS ENUM('adjust_assumption', 'initiative'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategy_goals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(200) NOT NULL,
	"assumption_id" varchar(36),
	"unit" "strategy_assumption_unit" NOT NULL,
	"target_value" numeric(18, 4) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "strategy_goal_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategy_goals_id_tenant_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "strategy_goals_period_order" CHECK ("strategy_goals"."period_end" >= "strategy_goals"."period_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategy_initiatives" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(200) NOT NULL,
	"goal_id" varchar(36),
	"owner_user_id" integer,
	"due_at" date,
	"status" "strategy_initiative_status" DEFAULT 'planned' NOT NULL,
	"note" varchar(500),
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategy_initiatives_id_tenant_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategy_variances" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"assumption_id" varchar(36) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"assumed_value" numeric(18, 4) NOT NULL,
	"actual_value" numeric(18, 4) NOT NULL,
	"sample_size" integer NOT NULL,
	"actual_source" varchar(30) NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"note" varchar(500),
	"decision" "strategy_variance_decision",
	"initiative_id" varchar(36),
	"decision_reason" varchar(500),
	"decided_by_user_id" integer,
	"decided_at" timestamp with time zone,
	"recorded_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategy_variances_period_order" CHECK ("strategy_variances"."period_end" >= "strategy_variances"."period_start"),
	CONSTRAINT "strategy_variances_sample_size" CHECK ("strategy_variances"."sample_size" >= 0),
	CONSTRAINT "strategy_variances_decision_shape" CHECK (("strategy_variances"."decision" IS NULL AND "strategy_variances"."initiative_id" IS NULL AND "strategy_variances"."decided_by_user_id" IS NULL) OR ("strategy_variances"."decision" = 'adjust_assumption' AND "strategy_variances"."initiative_id" IS NULL AND "strategy_variances"."decided_by_user_id" IS NOT NULL) OR ("strategy_variances"."decision" = 'initiative' AND "strategy_variances"."initiative_id" IS NOT NULL AND "strategy_variances"."decided_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_goals" ADD CONSTRAINT "strategy_goals_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_goals" ADD CONSTRAINT "strategy_goals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_goals" ADD CONSTRAINT "strategy_goals_assumption_fk" FOREIGN KEY ("assumption_id","tenant_id") REFERENCES "public"."strategy_assumptions"("id","tenant_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_initiatives" ADD CONSTRAINT "strategy_initiatives_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_initiatives" ADD CONSTRAINT "strategy_initiatives_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_initiatives" ADD CONSTRAINT "strategy_initiatives_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_initiatives" ADD CONSTRAINT "strategy_initiatives_goal_fk" FOREIGN KEY ("goal_id","tenant_id") REFERENCES "public"."strategy_goals"("id","tenant_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_variances" ADD CONSTRAINT "strategy_variances_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_variances" ADD CONSTRAINT "strategy_variances_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_variances" ADD CONSTRAINT "strategy_variances_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_variances" ADD CONSTRAINT "strategy_variances_assumption_fk" FOREIGN KEY ("assumption_id","tenant_id") REFERENCES "public"."strategy_assumptions"("id","tenant_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_variances" ADD CONSTRAINT "strategy_variances_initiative_fk" FOREIGN KEY ("initiative_id","tenant_id") REFERENCES "public"."strategy_initiatives"("id","tenant_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "strategy_goals_tenant_code_unique" ON "strategy_goals" USING btree ("tenant_id","code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "strategy_initiatives_tenant_code_unique" ON "strategy_initiatives" USING btree ("tenant_id","code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategy_variances_tenant_assumption_idx" ON "strategy_variances" USING btree ("tenant_id","assumption_id");
