import { hasScopeAccess, type ScopeType, type TenantAccessSnapshot } from "./authorization";
import type { ProductCode } from "../../drizzle/schema";

export type NavigationItem = { id: string; level: "EXECUTIVE" | "PMO" | "PROJECT" | "ADMIN"; labelKey: string; href: string; product: ProductCode; permission: string; scope: { type: ScopeType; id?: string } };

function isVisible(snapshot: TenantAccessSnapshot, item: NavigationItem) {
  return snapshot.membershipStatus === "active" && snapshot.entitledProducts.includes(item.product) && snapshot.permissionCodes.includes(item.permission) && hasScopeAccess(snapshot.scopes, item.scope);
}

export function buildTenantNavigation(input: { snapshot: TenantAccessSnapshot; tenantId: string; projectId?: string }) {
  const items: NavigationItem[] = [
    { id: "executive-dashboard", level: "EXECUTIVE", labelKey: "navigation.executiveDashboard", href: `/executive/${input.tenantId}`, product: "EXECUTIVE", permission: "executive.read", scope: { type: "company", id: input.tenantId } },
    { id: "pmo-dashboard", level: "PMO", labelKey: "navigation.pmoDashboard", href: `/pmo/${input.tenantId}`, product: "PMO", permission: "pmo.read", scope: { type: "company", id: input.tenantId } },
    { id: "project-registry", level: "PROJECT", labelKey: "navigation.projectRegistry", href: `/projects/${input.tenantId}`, product: "PROJECT", permission: "project.read", scope: { type: "company", id: input.tenantId } },
    { id: "tenant-administration", level: "ADMIN", labelKey: "navigation.tenantAdministration", href: `/tenants/${input.tenantId}/administration`, product: "EXECUTIVE", permission: "tenant.manage", scope: { type: "company", id: input.tenantId } },
  ];
  if (input.projectId) items.push({ id: "project-controls", level: "PROJECT", labelKey: "navigation.projectControls", href: `/projects/${input.tenantId}/${input.projectId}/controls`, product: "PROJECT", permission: "project.read", scope: { type: "project", id: input.projectId } });
  return items.filter(item => isVisible(input.snapshot, item));
}
