-- Q-25 (P-113): project meetings — the type, when and where, who attended, the minutes item by item — and the actions a meeting raised (actions.meeting_id).
-- Expand-only: three new tables and one nullable column on actions. Every child row (attendee, minutes item, action) belongs to a meeting of the SAME company and
-- project by a composite foreign key, and a meeting's «previous meeting» likewise. Existing actions keep meeting_id NULL.
-- Row-level security and the updated_at trigger come from project_os_apply_conventions(), run after this file; the explicit GRANT below says the intended privileges.
-- Rollback (no older code reads them): the triggers and their two functions go with the tables; ALTER TABLE "actions" DROP CONSTRAINT "actions_meeting_fk", DROP COLUMN "meeting_id"; DROP TABLE "project_meeting_items",
--   "project_meeting_attendees", "project_meetings"; DROP FUNCTION project_os_meeting_rows_append_only(), project_os_meeting_issue_only().
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
-- Q-25 (review of #413 by programmer B): «issued minutes are final» and «attendees and minutes items are added, not rewritten» held in the database for every
-- role, not by the application's grants (project_os_apply_conventions() re-grants the standard UPDATE and DELETE after every migration). ALWAYS: a session that
-- sets session_replication_role = replica still hits them, as audit_logs does. The one removal allowed is the company's erasure after its freeze.
CREATE OR REPLACE FUNCTION project_os_meeting_rows_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE meeting_status text;
BEGIN
  -- the one removal: the company's own erasure (server/tenantData.ts), after freezeTenant suspended it and wrote tenant.deletion_frozen to the audit trail
  IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM companies c WHERE c.id = OLD.tenant_id AND c.status <> 'active')
     AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.tenant_id = OLD.tenant_id AND a.action = 'tenant.deletion_frozen') THEN
    RETURN OLD;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'MEETING_ROWS_APPEND_ONLY: % rows are added to the minutes, never changed or removed', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- the meeting row is held (FOR SHARE) until this insert commits, so it cannot be issued in between
  SELECT m.status INTO meeting_status FROM project_meetings m WHERE m.id = NEW.meeting_id AND m.tenant_id = NEW.tenant_id AND m.project_id = NEW.project_id FOR SHARE;
  IF meeting_status = 'issued' THEN
    RAISE EXCEPTION 'MEETING_ISSUED: the minutes of meeting % are issued; nothing is added to them', NEW.meeting_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION project_os_meeting_issue_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM companies c WHERE c.id = OLD.tenant_id AND c.status <> 'active')
     AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.tenant_id = OLD.tenant_id AND a.action = 'tenant.deletion_frozen') THEN
    RETURN OLD; -- the company's own erasure, after its freeze (as above)
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'MEETING_KEPT: a meeting is never removed, except with the erasure of its whole company' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- the one change a meeting takes: a draft is issued (status, issued_at, and the updated_at the conventions keep); everything else is final
  IF OLD.status <> 'draft' OR NEW.status <> 'issued' OR (to_jsonb(NEW) - 'status' - 'issued_at' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'issued_at' - 'updated_at') THEN
    RAISE EXCEPTION 'MEETING_ISSUED: meeting % moves only from draft to issued, once; issued minutes are final', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS project_meeting_items_append_only ON project_meeting_items;
--> statement-breakpoint
CREATE TRIGGER project_meeting_items_append_only BEFORE INSERT OR UPDATE OR DELETE ON project_meeting_items FOR EACH ROW EXECUTE FUNCTION project_os_meeting_rows_append_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS project_meeting_items_no_truncate ON project_meeting_items;
--> statement-breakpoint
CREATE TRIGGER project_meeting_items_no_truncate BEFORE TRUNCATE ON project_meeting_items FOR EACH STATEMENT EXECUTE FUNCTION project_os_meeting_rows_append_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS project_meeting_attendees_append_only ON project_meeting_attendees;
--> statement-breakpoint
CREATE TRIGGER project_meeting_attendees_append_only BEFORE INSERT OR UPDATE OR DELETE ON project_meeting_attendees FOR EACH ROW EXECUTE FUNCTION project_os_meeting_rows_append_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS project_meeting_attendees_no_truncate ON project_meeting_attendees;
--> statement-breakpoint
CREATE TRIGGER project_meeting_attendees_no_truncate BEFORE TRUNCATE ON project_meeting_attendees FOR EACH STATEMENT EXECUTE FUNCTION project_os_meeting_rows_append_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS project_meetings_issue_only ON project_meetings;
--> statement-breakpoint
CREATE TRIGGER project_meetings_issue_only BEFORE UPDATE OR DELETE ON project_meetings FOR EACH ROW EXECUTE FUNCTION project_os_meeting_issue_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS project_meetings_no_truncate ON project_meetings;
--> statement-breakpoint
CREATE TRIGGER project_meetings_no_truncate BEFORE TRUNCATE ON project_meetings FOR EACH STATEMENT EXECUTE FUNCTION project_os_meeting_issue_only();
--> statement-breakpoint
ALTER TABLE project_meeting_items ENABLE ALWAYS TRIGGER project_meeting_items_append_only;
--> statement-breakpoint
ALTER TABLE project_meeting_items ENABLE ALWAYS TRIGGER project_meeting_items_no_truncate;
--> statement-breakpoint
ALTER TABLE project_meeting_attendees ENABLE ALWAYS TRIGGER project_meeting_attendees_append_only;
--> statement-breakpoint
ALTER TABLE project_meeting_attendees ENABLE ALWAYS TRIGGER project_meeting_attendees_no_truncate;
--> statement-breakpoint
ALTER TABLE project_meetings ENABLE ALWAYS TRIGGER project_meetings_issue_only;
--> statement-breakpoint
ALTER TABLE project_meetings ENABLE ALWAYS TRIGGER project_meetings_no_truncate;
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_meeting_rows_append_only(), project_os_meeting_issue_only() FROM PUBLIC;
--> statement-breakpoint
-- the intended privileges (project_os_apply_conventions() widens them again; the triggers above are what holds): read and add; a meeting moves only to «issued»
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
  IF (SELECT COUNT(*) FROM pg_trigger WHERE tgname IN ('project_meeting_items_append_only', 'project_meeting_attendees_append_only', 'project_meetings_issue_only', 'project_meeting_items_no_truncate', 'project_meeting_attendees_no_truncate', 'project_meetings_no_truncate') AND tgenabled = 'A') <> 6 THEN
    RAISE EXCEPTION '0039: a meeting append-only trigger is missing or not ALWAYS';
  END IF;
END $$;
