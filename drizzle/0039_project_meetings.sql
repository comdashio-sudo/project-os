-- Q-25 (P-113): project meetings — the type, when and where, who attended, the minutes item by item — and the actions a meeting raised (actions.meeting_id).
-- Expand-only: three new tables and one nullable column on actions. Every child row (attendee, minutes item, action) belongs to a meeting of the SAME company and
-- project by a composite foreign key, and a meeting's «previous meeting» likewise. Existing actions keep meeting_id NULL.
-- Row-level security and the updated_at trigger come from project_os_apply_conventions(), run after this file; the explicit GRANT below says the intended privileges.
-- Rollback (no older code reads them): ALTER TABLE "actions" DROP CONSTRAINT "actions_meeting_fk", DROP COLUMN "meeting_id"; DROP TABLE "project_meeting_items",
--   "project_meeting_attendees", "project_meetings".
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_meeting_attendees" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"meeting_id" varchar(36) NOT NULL,
	"membership_id" varchar(36),
	"name" varchar(160) NOT NULL,
	"organisation" varchar(160),
	"present" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_meeting_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"meeting_id" varchar(36) NOT NULL,
	"item_number" integer NOT NULL,
	"topic" varchar(255) NOT NULL,
	"discussion" text,
	"decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_meetings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"meeting_type" varchar(24) NOT NULL,
	"title" varchar(255) NOT NULL,
	"held_at" timestamp with time zone NOT NULL,
	"location" varchar(255),
	"previous_meeting_id" varchar(36),
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_meetings_id_tenant_project_unique" UNIQUE("id","tenant_id","project_id"),
	CONSTRAINT "project_meetings_type_check" CHECK ("project_meetings"."meeting_type" IN ('progress', 'coordination', 'safety', 'client', 'design', 'other')),
	CONSTRAINT "project_meetings_status_check" CHECK ("project_meetings"."status" IN ('draft', 'issued'))
);
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN IF NOT EXISTS "meeting_id" varchar(36);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "actions" ADD CONSTRAINT "actions_meeting_fk" FOREIGN KEY ("meeting_id","tenant_id","project_id") REFERENCES "public"."project_meetings"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_meeting_attendees" ADD CONSTRAINT "project_meeting_attendees_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_meeting_attendees" ADD CONSTRAINT "project_meeting_attendees_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_meeting_attendees" ADD CONSTRAINT "project_meeting_attendees_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_meeting_attendees" ADD CONSTRAINT "project_meeting_attendees_meeting_fk" FOREIGN KEY ("meeting_id","tenant_id","project_id") REFERENCES "public"."project_meetings"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_meeting_items" ADD CONSTRAINT "project_meeting_items_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_meeting_items" ADD CONSTRAINT "project_meeting_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_meeting_items" ADD CONSTRAINT "project_meeting_items_meeting_fk" FOREIGN KEY ("meeting_id","tenant_id","project_id") REFERENCES "public"."project_meetings"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_meetings" ADD CONSTRAINT "project_meetings_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_meetings" ADD CONSTRAINT "project_meetings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_meetings" ADD CONSTRAINT "project_meetings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_meetings" ADD CONSTRAINT "project_meetings_previous_fk" FOREIGN KEY ("previous_meeting_id","tenant_id","project_id") REFERENCES "public"."project_meetings"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "actions_meeting_idx" ON "actions" USING btree ("tenant_id","meeting_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_meeting_attendees_meeting_idx" ON "project_meeting_attendees" USING btree ("tenant_id","meeting_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_meeting_items_number_unique" ON "project_meeting_items" USING btree ("meeting_id","item_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_meetings_tenant_project_held_idx" ON "project_meetings" USING btree ("tenant_id","project_id","held_at");
--> statement-breakpoint
-- the application role reads and adds; a meeting moves only to «issued» (status, issued_at); attendees and minutes items are added, not rewritten
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_os_app') THEN
    GRANT SELECT, INSERT ON "project_meetings", "project_meeting_attendees", "project_meeting_items" TO project_os_app;
    GRANT UPDATE ("status", "issued_at", "updated_at") ON "project_meetings" TO project_os_app;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM pg_constraint WHERE conname IN ('actions_meeting_fk', 'project_meetings_previous_fk', 'project_meeting_attendees_meeting_fk', 'project_meeting_items_meeting_fk') AND contype = 'f' AND array_length(conkey, 1) = 3) <> 4 THEN
    RAISE EXCEPTION '0039: a same-project meeting key is missing';
  END IF;
END $$;
