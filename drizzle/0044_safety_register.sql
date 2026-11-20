-- Q-28 (P-117): the project's safety register — incidents (near misses to lost-time injuries) and permits to work for hazardous work.
-- Impact: expand-only. Four enum types and two new, empty tables; nothing existing changes. A lost-day count is allowed only on a lost-time injury or a
-- fatality (CHECK), and a permit's window must end after it starts (CHECK). The indicators LTIFR and TRIR are computed, never stored.
-- Row-level security, the updated_at trigger and the column grants come from project_os_apply_conventions(), run after this file.
-- Rollback (no older code reads them): DROP TABLE "work_permits"; DROP TABLE "safety_incidents";
--   DROP TYPE "work_permit_status", "work_permit_type", "safety_incident_status", "safety_incident_kind".
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."safety_incident_kind" AS ENUM('near_miss', 'first_aid', 'medical_treatment', 'restricted_work', 'lost_time', 'fatality', 'property_damage', 'environmental'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."safety_incident_status" AS ENUM('open', 'investigating', 'closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."work_permit_type" AS ENUM('hot_work', 'work_at_height', 'confined_space', 'excavation', 'electrical', 'lifting', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."work_permit_status" AS ENUM('active', 'closed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "safety_incidents" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"incident_number" varchar(60) NOT NULL,
	"occurred_on" date NOT NULL,
	"kind" "safety_incident_kind" NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"location" varchar(160),
	"people_involved" integer DEFAULT 0 NOT NULL,
	"lost_days" integer DEFAULT 0 NOT NULL,
	"root_cause" text,
	"corrective_action" text,
	"status" "safety_incident_status" DEFAULT 'open' NOT NULL,
	"reported_by_user_id" integer NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_incidents_counts_check" CHECK ("safety_incidents"."people_involved" >= 0 AND "safety_incidents"."lost_days" >= 0 AND ("safety_incidents"."lost_days" = 0 OR "safety_incidents"."kind" IN ('lost_time', 'fatality')))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_permits" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"permit_number" varchar(60) NOT NULL,
	"permit_type" "work_permit_type" NOT NULL,
	"description" text NOT NULL,
	"location" varchar(160),
	"responsible_party" varchar(160),
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone NOT NULL,
	"status" "work_permit_status" DEFAULT 'active' NOT NULL,
	"issued_by_user_id" integer NOT NULL,
	"closed_at" timestamp with time zone,
	"close_note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_permits_window_check" CHECK ("work_permits"."valid_to" > "work_permits"."valid_from")
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_permits" ADD CONSTRAINT "work_permits_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_permits" ADD CONSTRAINT "work_permits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "work_permits" ADD CONSTRAINT "work_permits_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "safety_incidents_project_number_unique" ON "safety_incidents" USING btree ("project_id","incident_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "safety_incidents_tenant_project_date_idx" ON "safety_incidents" USING btree ("tenant_id","project_id","occurred_on");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_permits_project_number_unique" ON "work_permits" USING btree ("project_id","permit_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_permits_tenant_project_status_idx" ON "work_permits" USING btree ("tenant_id","project_id","status");
