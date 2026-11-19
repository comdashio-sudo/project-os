-- Q-21 (a), batch 4: the company's opportunities pipeline (company-wide, no project) — not the procurement tenders inside a project (tender_packages).
-- Impact: expand-only. One enum type and one new, empty table; nothing existing changes. The winner of a lost opportunity is a competitor of the SAME
-- company (composite foreign key); the probability is 0–100 (CHECK).
-- Row-level security, the updated_at trigger and the column grants come from project_os_apply_conventions(), run after this file.
-- Rollback (no older code reads any of it): DROP TABLE "strategy_opportunities"; DROP TYPE "strategy_opportunity_status";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_opportunity_status" AS ENUM('open', 'submitted', 'won', 'lost', 'withdrawn'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategy_opportunities" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(200) NOT NULL,
	"client_name" varchar(200),
	"sector" varchar(120),
	"region" varchar(120),
	"estimated_value" numeric(18, 2) NOT NULL,
	"probability_percent" numeric(5, 2) NOT NULL,
	"expected_award_at" date,
	"duration_months" integer,
	"status" "strategy_opportunity_status" DEFAULT 'open' NOT NULL,
	"decided_at" date,
	"winner_competitor_id" varchar(36),
	"winning_value" numeric(18, 2),
	"outcome_note" varchar(500),
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategy_opportunities_probability_range" CHECK ("strategy_opportunities"."probability_percent" >= 0 AND "strategy_opportunities"."probability_percent" <= 100)
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_opportunities" ADD CONSTRAINT "strategy_opportunities_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_opportunities" ADD CONSTRAINT "strategy_opportunities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "strategy_opportunities" ADD CONSTRAINT "strategy_opportunities_winner_fk" FOREIGN KEY ("winner_competitor_id","tenant_id") REFERENCES "public"."strategy_competitors"("id","tenant_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "strategy_opportunities_tenant_code_unique" ON "strategy_opportunities" USING btree ("tenant_id","code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategy_opportunities_tenant_status_idx" ON "strategy_opportunities" USING btree ("tenant_id","status");
