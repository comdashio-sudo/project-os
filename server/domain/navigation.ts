import { holdsPermission, type ScopeType, type TenantAccessSnapshot } from "./authorization";
import type { ProductCode } from "../../drizzle/schema";
import { PAGE_ACCESS, REPORTS_HUB_READERS, SITE_HUB_READERS, pageAllowed, type PageKey } from "../../shared/pageAccess";

/**
 * Q-59 (1): the project's items sit in sections that fold (overview, the daily site, quality and safety, planning and control, reports, supply and money,
 * setup); the company's items in one more. `section` is the section's key; the client names it and remembers which are folded.
 */
export type NavigationSection = "overview" | "site" | "quality" | "planning" | "reports" | "supply" | "setup" | "company";
export const NAVIGATION_SECTIONS: readonly NavigationSection[] = ["overview", "site", "quality", "planning", "reports", "supply", "setup", "company"];
export type NavigationItem = { id: string; level: "EXECUTIVE" | "PMO" | "PROJECT" | "ADMIN"; group: "project" | "company"; section: NavigationSection; labelKey: string; href: string; product: ProductCode; permission: string | readonly string[]; scope: { type: ScopeType; id?: string }; visible?: (snapshot: TenantAccessSnapshot) => boolean };

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
    const p = input.projectId; const project = { type: "project" as const, id: p }; const base = `/projects/${t}/${p}`;
    // an item for a page with its own gate (shared/pageAccess.ts, client/src/App.tsx gatedPage): shown only to whoever that gate lets in, on this project
    const page = (id: string, section: NavigationSection, labelKey: string, href: string, gate: PageKey): NavigationItem => ({
      id, level: "PROJECT", group: "project", section, labelKey, href, product: "PROJECT", permission: PAGE_ACCESS[gate][0], scope: project,
      visible: snapshot => snapshot.membershipStatus === "active" && snapshot.entitledProducts.includes("PROJECT") && pageAllowed(gate, codes => holdsPermission(snapshot, codes, project)),
    });
    // an item whose page has no gate of its own: the permissions its server read accepts
    const read = (id: string, section: NavigationSection, labelKey: string, href: string, permission: string | readonly string[]): NavigationItem => ({ id, level: "PROJECT", group: "project", section, labelKey, href, product: "PROJECT", permission, scope: project });
    items.push(
      page("project-controls", "overview", "navigation.projectControls", `${base}/controls`, "controls"),
      read("my-performance", "overview", "navigation.myPerformance", `${base}/my-performance`, "project.performance.read_own"),
      // Q-36 (2 b, 2 c): the site's and the reports' entry pages stay, each heading its section
      read("project-site", "site", "navigation.projectSite", `${base}/site`, SITE_HUB_READERS),
      // Q-59 (2): the site's records (field reports, quality register, HSE, RFI, NCR, changes, resources, workforce, design) — the board's site level, its own page
      page("project-field-records", "site", "page.fieldRecords", `${base}/field-records`, "controls"),
      page("project-daily-report", "site", "page.dailyReport", `/m/${t}/${p}/report`, "dailyReport"),
      page("project-progress", "site", "page.progress", `/m/${t}/${p}/progress`, "progress"),
      page("project-qc", "site", "page.qcReceipt", `/m/${t}/${p}/qc`, "qc"),
      page("project-stalled", "site", "page.stalled", `${base}/stalled`, "stalled"),
      page("project-quality", "quality", "page.quality", `${base}/quality`, "quality"),
      // consultantSubmittals.list (server/consultantSubmittals.ts READ)
      read("project-submittals", "quality", "page.submittals", `${base}/submittals`, ["project.read", "project.field.manage", "project.design.manage", "project.design.approve", "project.manage"]),
      page("project-safety", "quality", "page.safety", `${base}/safety`, "safety"),
      page("project-planning", "planning", "navigation.projectPlanning", `${base}/planning`, "controls"),
      page("project-schedule", "planning", "page.liveSchedule", `${base}/schedule`, "schedule"),
      page("project-pmc", "planning", "page.pmc", `${base}/pmc`, "pmc"),
      page("project-risks", "planning", "page.risks", `${base}/risks`, "risks"),
      page("project-meetings", "planning", "page.meetings", `${base}/meetings`, "meetings"),
      read("project-reports", "reports", "navigation.projectReports", `${base}/reports`, REPORTS_HUB_READERS),
      page("project-weekly-report", "reports", "page.weeklyReport", `${base}/weekly-report`, "weeklyReport"),
      page("project-monthly-report", "reports", "page.monthlyReport", `${base}/monthly-report`, "monthlyReport"),
      page("project-site-consultant", "reports", "page.siteConsultant", `${base}/site-consultant`, "siteConsultant"),
      page("project-supply", "supply", "navigation.projectSupply", `${base}/supply`, "controls"),
      page("project-commercial", "supply", "navigation.projectCommercial", `${base}/commercial`, "commercial"),
      // the board's contracts level (contracts, claims, documents, tenders), its own page
      page("project-contracts", "supply", "page.contractsRecords", `${base}/contracts`, "controls"),
      page("project-profitability", "supply", "page.profitability", `${base}/profitability`, "profitability"),
      page("project-baseline", "setup", "page.baseline", `${base}/baseline`, "baseline"),
      // the import entry opens for whoever may open one of its pages (client/src/App.tsx ImportHubGate, IMPORT_HUB_READERS)
      read("project-import", "setup", "page.imports", `${base}/import`, ["project.read", "project.pmc.read", "project.manage"]),
      page("project-team", "setup", "navigation.projectTeam", `${base}/team`, "team"),
      read("project-guide", "setup", "page.guide", `${base}/guide`, "project.read"),
    );
  }
  items.push(
    // operations.overview answers over the projects the person reads (server/operationsOverview.ts: project.read at any scope)
    { id: "operations", level: "PROJECT", group: "company", section: "company", labelKey: "page.operations", href: `/operations/${t}`, product: "PROJECT", permission: "project.read", scope: company, visible: snapshot => snapshot.membershipStatus === "active" && snapshot.entitledProducts.includes("PROJECT") && holdsPermission(snapshot, "project.read") },
    { id: "pmo-dashboard", level: "PMO", group: "company", section: "company", labelKey: "navigation.pmoDashboard", href: `/pmo/${t}`, product: "PMO", permission: "pmo.read", scope: company },
    { id: "executive-dashboard", level: "EXECUTIVE", group: "company", section: "company", labelKey: "navigation.executiveDashboard", href: `/executive/${t}`, product: "EXECUTIVE", permission: "executive.read", scope: company },
    { id: "strategy", level: "EXECUTIVE", group: "company", section: "company", labelKey: "page.strategy", href: `/strategy/${t}`, product: "EXECUTIVE", permission: "strategy.read", scope: company },
    { id: "project-registry", level: "PROJECT", group: "company", section: "company", labelKey: "navigation.projectRegistry", href: `/projects/${t}`, product: "PROJECT", permission: "project.read", scope: company },
    { id: "employee-registry", level: "PROJECT", group: "company", section: "company", labelKey: "navigation.employeeRegistry", href: `/people/${t}`, product: "PROJECT", permission: "project.hr.manage", scope: company },
    { id: "payroll", level: "PROJECT", group: "company", section: "company", labelKey: "navigation.payroll", href: `/payroll/${t}`, product: "PROJECT", permission: ["project.payroll.structure", "project.payroll.run", "project.payroll.approve", "project.payroll.sensitive.read"], scope: company },
    { id: "levels", level: "PROJECT", group: "company", section: "company", labelKey: "navigation.levels", href: `/levels/${t}`, product: "PROJECT", permission: "project.read", scope: company, visible: canEnterLevels },
    { id: "tenant-administration", level: "ADMIN", group: "company", section: "company", labelKey: "navigation.tenantAdministration", href: `/tenants/${t}/administration`, product: "EXECUTIVE", permission: "tenant.manage", scope: company },
  );
  // `visible` is a rule for the server, not part of what the sidebar receives.
  return items.filter(item => isVisible(input.snapshot, item)).map(({ visible: _rule, ...item }) => item);
}
