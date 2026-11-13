// The one synthetic demo tenant scripts/seed-demo-tenant.mjs creates, named once so the scripts that look it up cannot drift from it
// (D-28: tests/ui/prepareRoleUsers.mjs looked for "demo-construction"/"DEMO-001", which nothing seeds, so the all-roles visit could not start).
export const DEMO_TENANT_SLUG = "co-1001";
export const DEMO_PROJECT_CODE = "PRJ-1001";
