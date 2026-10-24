// The four management levels (owner decision, work order 13, items 6–7). A person enters at the dashboard of the highest level they
// hold and goes one level down with one click. The data for each level is the server's own (`scopes.*`, scopeDashboards.ts); this file
// only names the levels, builds their links and applies the entry rule. It holds no money, no permission and no server rule of its own.

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

/** The contract the four screens read: the server's own answers for `scopes.*` (server/scopeDashboards.ts), typed through the router. */
export type ScopeLevels = inferRouterOutputs<AppRouter>["scopes"];
export type ProjectKpi = ScopeLevels["company"]["projects"][number];

export const LEVEL_IDS = ["company", "portfolio", "project", "warehouse"] as const;
export type LevelId = (typeof LEVEL_IDS)[number];

/** Arabic first; English is the second language of the same screen, chosen by the page's `isArabic`. */
export const LEVEL_NAMES: Record<LevelId, { ar: string; en: string; ur: string }> = {
  company: { ar: "الشركة ومجلس الإدارة", en: "Company and board", ur: "Company and board" },
  portfolio: { ar: "إدارة المشاريع (المحفظة)", en: "Projects management (portfolio)", ur: "Projects management (portfolio)" },
  project: { ar: "المشروع", en: "Project", ur: "Project" },
  warehouse: { ar: "المستودع", en: "Warehouse", ur: "Warehouse" },
};

/** The navigation ids the server already returns for the two company-wide levels (server/domain/navigation.ts). */
export const NAV_EXECUTIVE = "executive-dashboard";
export const NAV_PMO = "pmo-dashboard";

/** The level one step down; the warehouse is the lowest level and has none. */
export function levelBelow(level: LevelId): LevelId | null {
  const index = LEVEL_IDS.indexOf(level);
  return index >= 0 && index < LEVEL_IDS.length - 1 ? LEVEL_IDS[index + 1] : null;
}

export function levelHref(tenantId: string, level: LevelId, projectId?: string): string {
  switch (level) {
    case "company": return `/levels/${tenantId}/company`;
    case "portfolio": return `/levels/${tenantId}/portfolio`;
    case "project": return `/levels/${tenantId}/projects/${projectId ?? ""}`;
    case "warehouse": return `/levels/${tenantId}/projects/${projectId ?? ""}/warehouse`;
  }
}

export type EntryTarget = { level: "company" } | { level: "portfolio" } | { level: "project"; projectId: string };

/**
 * The entry rule: the highest level the person holds, read from the navigation the server computed for them.
 *  - company: the server offers the executive dashboard (EXECUTIVE + executive.read on the whole company);
 *  - portfolio: the server offers the PMO dashboard (PMO + pmo.read on the whole company);
 *  - project: otherwise, the first project the person's own project.read assignment covers (sorted by code, so the answer is stable);
 *  - none: null. The warehouse is not an entry level: it is reached from a project, never offered on its own.
 * A person holding two scopes gets the higher one: company over portfolio over project.
 */
export function pickEntryLevel(input: { navigationIds: readonly string[]; projects: readonly { id: string; code: string }[] }): EntryTarget | null {
  const offered = new Set(input.navigationIds);
  if (offered.has(NAV_EXECUTIVE)) return { level: "company" };
  if (offered.has(NAV_PMO)) return { level: "portfolio" };
  const first = input.projects.slice().sort((a, b) => a.code.localeCompare(b.code))[0];
  return first ? { level: "project", projectId: first.id } : null;
}

/**
 * The figures of one project as the screens show them. An unavailable figure stays `null` (the server said why it cannot be computed);
 * it is never read as zero, so a project with no EVM is not mistaken for a project on budget.
 */
export function kpiValues(project: ProjectKpi) {
  return {
    profit: project.expectedProfit.value,
    cpi: "cpi" in project.evm ? project.evm.cpi : null,
    spi: "spi" in project.evm ? project.evm.spi : null,
    vac: "vac" in project.evm ? project.evm.vac : null,
    progress: "percent" in project.progress ? project.progress.percent : null,
  };
}
