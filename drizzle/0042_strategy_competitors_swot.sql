-- Q-21 (a), batch 3: competitors and SWOT, company-wide (no project).
-- Impact: expand-only. One new enum type and two new, empty tables; nothing existing changes. A SWOT point may name a competitor and an assumption of the
-- SAME company (composite foreign keys). Nothing is deleted by the application: a competitor or a point no longer held is archived.
-- Row-level security, the updated_at trigger and the column grants come from project_os_apply_conventions(), run after this file.
-- Rollback (no older code reads any of it): DROP TABLE "strategy_swot_items"; DROP TABLE "strategy_competitors"; DROP TYPE "strategy_swot_kind";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_swot_kind" AS ENUM('strength', 'weakness', 'opportunity', 'threat'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategy_competitors" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" varchar(200) NOT NULL,
	"sector" varchar(120),
	"region" varchar(120),
	"project_types" varchar(300),
	"size_value" numeric(18, 2),
	"size_evidence" "strategy_assumption_evidence" DEFAULT 'estimate' NOT NULL,
	"source_note" varchar(500),
	"source_url" varchar(500),
	"collected_at" date NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategy_competitors_id_tenant_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategy_swot_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"kind" "strategy_swot_kind" NOT NULL,
	"statement" varchar(500) NOT NULL,
	"evidence" varchar(500) NOT NULL,
	"competitor_id" varchar(36),
	"assumption_id" varchar(36),
	"archived" boolean DEFAULT false NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_competitors" ADD CONSTRAINT "strategy_competitors_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_competitors" ADD CONSTRAINT "strategy_competitors_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_swot_items" ADD CONSTRAINT "strategy_swot_items_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_swot_items" ADD CONSTRAINT "strategy_swot_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_swot_items" ADD CONSTRAINT "strategy_swot_items_competitor_fk" FOREIGN KEY ("competitor_id","tenant_id") REFERENCES "public"."strategy_competitors"("id","tenant_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_swot_items" ADD CONSTRAINT "strategy_swot_items_assumption_fk" FOREIGN KEY ("assumption_id","tenant_id") REFERENCES "public"."strategy_assumptions"("id","tenant_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "strategy_competitors_tenant_name_unique" ON "strategy_competitors" USING btree ("tenant_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategy_swot_items_tenant_kind_idx" ON "strategy_swot_items" USING btree ("tenant_id","kind");
--> statement-breakpoint
-- refuse to finish without the same-company keys the links stand on
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM pg_constraint WHERE conname IN ('strategy_swot_items_competitor_fk', 'strategy_swot_items_assumption_fk') AND contype = 'f' AND array_length(conkey, 1) = 2) <> 2 THEN RAISE EXCEPTION '0042: the same-company link keys are missing'; END IF;
END $$;
