-- Q-53 (adviser 20-11): a project's profitability (the report, its history, the expected profit on the levels dashboards) becomes its own permission,
-- project.profit.read, so the operations manager can read cost, budget and cash flow (project.cashflow.read) without it.
-- Impact: data only, additive. No table, column or type changes. Adds the catalogue row and gives project.profit.read to EVERY role (ready-made or custom,
-- in every company) that holds project.cashflow.read today, with one audit row per role in that role's company, so whoever saw a project's profitability
-- before this release still sees it. The ready-made templates carry the code from this release (server/domain/operationalRoles.ts); the template sync
-- would add it to them as well, the custom roles only get it here. Safe to run again: both inserts skip what exists.
-- Rollback: deploy the previous code first (it reads profitability with project.cashflow.read, which every holder kept), then
--   DELETE FROM "role_permissions" WHERE "permission_id" = (SELECT "id" FROM "permissions" WHERE "code" = 'project.profit.read');
--   DELETE FROM "permissions" WHERE "code" = 'project.profit.read';
--   (the audit rows stay: audit_logs is append-only).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
INSERT INTO "permissions" ("id", "code", "name", "product_code")
VALUES (gen_random_uuid()::text, 'project.profit.read', 'View project profitability', 'PROJECT')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
WITH "added" AS (
  INSERT INTO "role_permissions" ("role_id", "permission_id")
  SELECT "held"."role_id", "profit"."id"
  FROM "role_permissions" "held"
  JOIN "permissions" "cashflow" ON "cashflow"."id" = "held"."permission_id" AND "cashflow"."code" = 'project.cashflow.read'
  CROSS JOIN "permissions" "profit"
  WHERE "profit"."code" = 'project.profit.read'
  ON CONFLICT DO NOTHING
  RETURNING "role_id"
)
INSERT INTO "audit_logs" ("id", "tenant_id", "actor_user_id", "action", "entity_type", "entity_id", "metadata")
SELECT gen_random_uuid()::text, "roles"."tenant_id", NULL, 'role_template.permission_added', 'role', "roles"."id",
  json_build_object('role', "roles"."code", 'permission', 'project.profit.read', 'source', 'migration 0046: the role held project.cashflow.read')::text
FROM "added" JOIN "roles" ON "roles"."id" = "added"."role_id";
