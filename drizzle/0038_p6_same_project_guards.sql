-- G-209: same-project guards on the P6 schedule's sibling tables (activity_code_assignments, activity_resource_assignments, activity_code_values,
-- activities.calendar_id), in the pattern of activity_relationships_same_project (baseline-security.sql).
-- Impact: four trigger functions and four BEFORE INSERT/UPDATE row triggers; no table, column, grant or row changes. Rows already stored are not re-checked:
-- the check below counts any that would be refused, and the migration stops if one exists (none can, the import writes its own project's ids only).
-- Rollback: DROP TRIGGER activity_code_assignments_same_project ON activity_code_assignments; DROP TRIGGER activity_resource_assignments_same_project ON
--   activity_resource_assignments; DROP TRIGGER activity_code_values_same_project ON activity_code_values; DROP TRIGGER activities_calendar_same_project ON activities;
--   and the four functions.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM activity_code_assignments x LEFT JOIN activities a ON a.id = x.activity_id LEFT JOIN activity_code_values v ON v.id = x.code_value_id
             WHERE a.project_id IS DISTINCT FROM x.project_id OR v.project_id IS DISTINCT FROM x.project_id OR v.code_type_id IS DISTINCT FROM x.code_type_id)
     OR EXISTS (SELECT 1 FROM activity_resource_assignments x LEFT JOIN activities a ON a.id = x.activity_id LEFT JOIN project_resources r ON r.id = x.resource_id
             WHERE a.project_id IS DISTINCT FROM x.project_id OR r.project_id IS DISTINCT FROM x.project_id)
     OR EXISTS (SELECT 1 FROM activity_code_values x JOIN activity_code_values p ON p.id = x.parent_id WHERE p.project_id IS DISTINCT FROM x.project_id)
     OR EXISTS (SELECT 1 FROM activities x JOIN schedule_calendars c ON c.id = x.calendar_id WHERE c.project_id IS DISTINCT FROM x.project_id) THEN
    RAISE EXCEPTION '0038: a stored row already joins two projects; resolve it before adding the guard';
  END IF;
END $$;
--> statement-breakpoint
-- G-209 (D-4, review of #153 @ 441821c, item 3): the P6 schedule's sibling tables join rows of ITS OWN project, as activity_relationships already does.
-- The foreign keys only say each end exists; these say each end is in the row's project and company, so no path (the P6 import, a later screen, a hand-written
-- INSERT) can tie project A's activity to project B's code, resource or calendar. Each runs as the caller, under row-level security: an end the caller cannot
-- see is not found, and the row is refused (fail closed).
CREATE OR REPLACE FUNCTION project_os_activity_code_assignment_same_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM activities a WHERE a.id = NEW.activity_id AND a.project_id = NEW.project_id AND a.tenant_id = NEW.tenant_id)
     OR NOT EXISTS (SELECT 1 FROM activity_code_types t WHERE t.id = NEW.code_type_id AND t.project_id = NEW.project_id AND t.tenant_id = NEW.tenant_id)
     OR NOT EXISTS (SELECT 1 FROM activity_code_values v WHERE v.id = NEW.code_value_id AND v.project_id = NEW.project_id AND v.tenant_id = NEW.tenant_id AND v.code_type_id = NEW.code_type_id) THEN
    RAISE EXCEPTION 'ACTIVITY_CODE_ASSIGNMENT_CROSS_PROJECT: the activity, the code type and its value must belong to project %', NEW.project_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION project_os_activity_resource_assignment_same_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM activities a WHERE a.id = NEW.activity_id AND a.project_id = NEW.project_id AND a.tenant_id = NEW.tenant_id)
     OR NOT EXISTS (SELECT 1 FROM project_resources r WHERE r.id = NEW.resource_id AND r.project_id = NEW.project_id AND r.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'ACTIVITY_RESOURCE_ASSIGNMENT_CROSS_PROJECT: the activity and the resource must belong to project %', NEW.project_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION project_os_activity_code_value_same_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM activity_code_types t WHERE t.id = NEW.code_type_id AND t.project_id = NEW.project_id AND t.tenant_id = NEW.tenant_id)
     OR (NEW.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM activity_code_values p WHERE p.id = NEW.parent_id AND p.project_id = NEW.project_id AND p.tenant_id = NEW.tenant_id AND p.code_type_id = NEW.code_type_id)) THEN
    RAISE EXCEPTION 'ACTIVITY_CODE_VALUE_CROSS_PROJECT: the code type and the parent value must belong to project %', NEW.project_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION project_os_activity_calendar_same_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.calendar_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM schedule_calendars c WHERE c.id = NEW.calendar_id AND c.project_id = NEW.project_id AND c.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'ACTIVITY_CALENDAR_CROSS_PROJECT: the calendar must belong to project %', NEW.project_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER activity_code_assignments_same_project BEFORE INSERT OR UPDATE OF activity_id, code_type_id, code_value_id, project_id, tenant_id ON activity_code_assignments FOR EACH ROW EXECUTE FUNCTION project_os_activity_code_assignment_same_project();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER activity_resource_assignments_same_project BEFORE INSERT OR UPDATE OF activity_id, resource_id, project_id, tenant_id ON activity_resource_assignments FOR EACH ROW EXECUTE FUNCTION project_os_activity_resource_assignment_same_project();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER activity_code_values_same_project BEFORE INSERT OR UPDATE OF code_type_id, parent_id, project_id, tenant_id ON activity_code_values FOR EACH ROW EXECUTE FUNCTION project_os_activity_code_value_same_project();
--> statement-breakpoint
CREATE OR REPLACE TRIGGER activities_calendar_same_project BEFORE INSERT OR UPDATE OF calendar_id, project_id, tenant_id ON activities FOR EACH ROW EXECUTE FUNCTION project_os_activity_calendar_same_project();
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_activity_code_assignment_same_project(), project_os_activity_resource_assignment_same_project(), project_os_activity_code_value_same_project(), project_os_activity_calendar_same_project() FROM PUBLIC;
--> statement-breakpoint
-- refuse to finish without the four triggers
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM pg_trigger WHERE tgname IN ('activity_code_assignments_same_project', 'activity_resource_assignments_same_project', 'activity_code_values_same_project', 'activities_calendar_same_project') AND NOT tgisinternal) <> 4 THEN
    RAISE EXCEPTION '0038: the same-project guards are missing';
  END IF;
END $$;
