import { holdsPermission, type ScopeType, type TenantAccessSnapshot } from "./authorization";
import type { ProductCode } from "../../drizzle/schema";

export type NavigationItem = { id: string; level: "EXECUTIVE" | "PMO" | "PROJECT" | "ADMIN"; labelKey: string; href: string; product: ProductCode; permission: string | readonly string[]; scope: { type: ScopeType; id?: string }; visible?: (snapshot: TenantAccessSnapshot) => boolean };

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

export function buildTenantNavigation(input: { snapshot: TenantAccessSnapshot; tenantId: string; projectId?: string }) {
  const items: NavigationItem[] = [
    { id: "levels", level: "PROJECT", labelKey: "navigation.levels", href: `/levels/${input.tenantId}`, product: "PROJECT", permission: "project.read", scope: { type: "company", id: input.tenantId }, visible: canEnterLevels },
    { id: "executive-dashboard", level: "EXECUTIVE", labelKey: "navigation.executiveDashboard", href: `/executive/${input.tenantId}`, product: "EXECUTIVE", permission: "executive.read", scope: { type: "company", id: input.tenantId } },
    { id: "pmo-dashboard", level: "PMO", labelKey: "navigation.pmoDashboard", href: `/pmo/${input.tenantId}`, product: "PMO", permission: "pmo.read", scope: { type: "company", id: input.tenantId } },
    { id: "project-registry", level: "PROJECT", labelKey: "navigation.projectRegistry", href: `/projects/${input.tenantId}`, product: "PROJECT", permission: "project.read", scope: { type: "company", id: input.tenantId } },
    { id: "employee-registry", level: "PROJECT", labelKey: "navigation.employeeRegistry", href: `/people/${input.tenantId}`, product: "PROJECT", permission: "project.hr.manage", scope: { type: "company", id: input.tenantId } },
    { id: "payroll", level: "PROJECT", labelKey: "navigation.payroll", href: `/payroll/${input.tenantId}`, product: "PROJECT", permission: ["project.payroll.structure", "project.payroll.run", "project.payroll.approve", "project.payroll.sensitive.read"], scope: { type: "company", id: input.tenantId } },
    { id: "tenant-administration", level: "ADMIN", labelKey: "navigation.tenantAdministration", href: `/tenants/${input.tenantId}/administration`, product: "EXECUTIVE", permission: "tenant.manage", scope: { type: "company", id: input.tenantId } },
  ];
  if (input.projectId) {
    items.push({ id: "project-controls", level: "PROJECT", labelKey: "navigation.projectControls", href: `/projects/${input.tenantId}/${input.projectId}/controls`, product: "PROJECT", permission: "project.read", scope: { type: "project", id: input.projectId } });
    items.push({ id: "my-performance", level: "PROJECT", labelKey: "navigation.myPerformance", href: `/projects/${input.tenantId}/${input.projectId}/my-performance`, product: "PROJECT", permission: "project.performance.read_own", scope: { type: "project", id: input.projectId } });
  }
  // `visible` is a rule for the server, not part of what the sidebar receives.
  return items.filter(item => isVisible(input.snapshot, item)).map(({ visible: _rule, ...item }) => item);
}
