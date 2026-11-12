// Q-4 part 2: a site engineer opens straight on «Progress update». When the person belongs to exactly one active company and, in it, holds only project-scoped
// roles for exactly one project with the update permission, the workspace has nothing else for them: the app goes to /m/<company>/<project>/progress. Once per
// browser session, so «Workspace» stays reachable. Anyone with a company-wide role, or more than one project or company, stays on the workspace.
type Tenant = { tenantId: string; status: string };
type Summary = { member: boolean; permissions: readonly string[]; scopes: ReadonlyArray<{ scopeType: string; scopeId: string | null }> };

export const FIELD_LANDING_KEY = "dashio-field-landing-done";

export function singleActiveTenant(tenants: readonly Tenant[] | undefined): string | null {
  const active = (tenants ?? []).filter(item => item.status === "active");
  return active.length === 1 ? active[0].tenantId : null;
}

export function fieldLandingPath(tenantId: string | null, summary: Summary | undefined): string | null {
  if (!tenantId || !summary?.member || !summary.permissions.includes("project.pmc.update")) return null;
  if (!summary.scopes.length || summary.scopes.some(scope => scope.scopeType !== "project" || !scope.scopeId)) return null;
  const projects = new Set(summary.scopes.map(scope => scope.scopeId));
  return projects.size === 1 ? `/m/${tenantId}/${Array.from(projects)[0]}/progress` : null;
}
