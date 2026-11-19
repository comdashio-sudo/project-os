import { holdsPermission, type ScopeType, type TenantAccessSnapshot } from "./authorization";
import type { ProductCode } from "../../drizzle/schema";
import { PAGE_ACCESS, REPORTS_HUB_READERS, SITE_HUB_READERS } from "../../shared/pageAccess";

export type NavigationItem = { id: string; level: "EXECUTIVE" | "PMO" | "PROJECT" | "ADMIN"; group: "project" | "company"; labelKey: string; href: string; product: ProductCode; permission: string | readonly string[]; scope: { type: ScopeType; id?: string }; visible?: (snapshot: TenantAccessSnapshot) => boolean };

/**
 * The levels entry (work order 16, G-193 to G-195). A person can enter the levels when the snapshot holds one of the permissions that opens a level,
 * on a licensed product: executive.read at company scope (the company level), pmo.read at any scope (the portfolio level, which answers only over the
 * person's own projects), project.read or project.manage at any scope, and project.inventory.manage at any scope (the warehouse, reached from a project).
 * Each permission is read with the scope of the assignment that carries it (G-142, D-18); `/levels/:tenantId` still asks the server per assignment (levelReads.entry).
 */
const LEVEL_ENTRY: readonly { product: ProductCode; permissions: readonly string[]; companyOnly?: boolean }[] = [
  { product: "EXECUTIVE", permissions: ["executive.read"], companyOnly: true },
  { product: "PMO", permissions: ["pmo.read"] },
  { product: "PROJECT", permissions: ["project.read", "project.manage", "project.inventory.manage"] },
];

export function canEnterLevels(snapshot: TenantAccessSnapshot): boolean {
  if (snapshot.membershipStatus !== "active") return false;
  return LEVEL_ENTRY.some(entry => snapshot.entitledProducts.includes(entry.product)
    && (entry.companyOnly ? holdsPermission(snapshot, entry.permissions, { type: "company" }) : holdsPermission(snapshot, entry.permissions)));
}

function isVisible(snapshot: TenantAccessSnapshot, item: NavigationItem) {
  if (item.visible) return item.visible(snapshot);
  const permissions = Array.isArray(item.permission) ? item.permission : [item.permission];
  return snapshot.membershipStatus === "active" && snapshot.entitledProducts.includes(item.product) && holdsPermission(snapshot, permissions, item.scope);
}

/**
 * Q-36 (step 2, docs/proposals/navigation.md §3.1 and the adviser's decision §6): two groups, the open project's FIRST, then the company's. Within the company:
 * administration · projects and PMO · people and payroll · executive with the levels under it (decision 4). Every item keeps the exact rule it had (or, for the
 * new project items, the rule its page's own gate and server read check — client/src/App.tsx gatedPage), so nobody is shown a link the server refuses.
 */
export function buildTenantNavigation(input: { snapshot: TenantAccessSnapshot; tenantId: string; projectId?: string }) {
  const t = input.tenantId; const company = { type: "company" as const, id: t };
  const items: NavigationItem[] = [];
  if (input.projectId) {
    const p = input.projectId; const project = { type: "project" as const, id: p };
    items.push(
      { id: "project-controls", level: "PROJECT", group: "project", labelKey: "navigation.projectControls", href: `/projects/${t}/${p}/controls`, product: "PROJECT", permission: "project.read", scope: project },
      // Q-36 (4 b): two levels that live as sections of the project board (#planning, #supply) — the board's own gate (shared/pageAccess.ts controls)
      { id: "project-planning", level: "PROJECT", group: "project", labelKey: "navigation.projectPlanning", href: `/projects/${t}/${p}/controls#planning`, product: "PROJECT", permission: PAGE_ACCESS.controls[0], scope: project },
      // Q-36 (2 b): the site's entry page, for whoever may open at least one of its four pages (shared/pageAccess.ts SITE_HUB_READERS)
      { id: "project-site", level: "PROJECT", group: "project", labelKey: "navigation.projectSite", href: `/projects/${t}/${p}/site`, product: "PROJECT", permission: SITE_HUB_READERS, scope: project },
      { id: "project-supply", level: "PROJECT", group: "project", labelKey: "navigation.projectSupply", href: `/projects/${t}/${p}/controls#supply`, product: "PROJECT", permission: PAGE_ACCESS.controls[0], scope: project },
      { id: "project-commercial", level: "PROJECT", group: "project", labelKey: "navigation.projectCommercial", href: `/projects/${t}/${p}/commercial`, product: "PROJECT", permission: "project.read", scope: project },
      // Q-36 (2 c): the reports' entry page, for whoever may open one of them (shared/pageAccess.ts REPORTS_HUB_READERS)
      { id: "project-reports", level: "PROJECT", group: "project", labelKey: "navigation.projectReports", href: `/projects/${t}/${p}/reports`, product: "PROJECT", permission: REPORTS_HUB_READERS, scope: project },
      { id: "project-team", level: "PROJECT", group: "project", labelKey: "navigation.projectTeam", href: `/projects/${t}/${p}/team`, product: "PROJECT", permission: ["project.manage", "project.team.invite"], scope: project },
      { id: "my-performance", level: "PROJECT", group: "project", labelKey: "navigation.myPerformance", href: `/projects/${t}/${p}/my-performance`, product: "PROJECT", permission: "project.performance.read_own", scope: project },
    );
  }
  items.push(
    { id: "tenant-administration", level: "ADMIN", group: "company", labelKey: "navigation.tenantAdministration", href: `/tenants/${t}/administration`, product: "EXECUTIVE", permission: "tenant.manage", scope: company },
    { id: "project-registry", level: "PROJECT", group: "company", labelKey: "navigation.projectRegistry", href: `/projects/${t}`, product: "PROJECT", permission: "project.read", scope: company },
    { id: "pmo-dashboard", level: "PMO", group: "company", labelKey: "navigation.pmoDashboard", href: `/pmo/${t}`, product: "PMO", permission: "pmo.read", scope: company },
    { id: "employee-registry", level: "PROJECT", group: "company", labelKey: "navigation.employeeRegistry", href: `/people/${t}`, product: "PROJECT", permission: "project.hr.manage", scope: company },
    { id: "payroll", level: "PROJECT", group: "company", labelKey: "navigation.payroll", href: `/payroll/${t}`, product: "PROJECT", permission: ["project.payroll.structure", "project.payroll.run", "project.payroll.approve", "project.payroll.sensitive.read"], scope: company },
    { id: "executive-dashboard", level: "EXECUTIVE", group: "company", labelKey: "navigation.executiveDashboard", href: `/executive/${t}`, product: "EXECUTIVE", permission: "executive.read", scope: company },
    { id: "levels", level: "PROJECT", group: "company", labelKey: "navigation.levels", href: `/levels/${t}`, product: "PROJECT", permission: "project.read", scope: company, visible: canEnterLevels },
  );
  // `visible` is a rule for the server, not part of what the sidebar receives.
  return items.filter(item => isVisible(input.snapshot, item)).map(({ visible: _rule, ...item }) => item);
}
