// The four management levels (owner decision, work order 13, items 6–7). A person enters at the dashboard of the highest level they
// hold and goes one level down with one click. The data for each level is the server's own (`scopes.*`, scopeDashboards.ts; `levelReads.*`, levelReads.ts); this file
// only names the levels and builds their links. It holds no money, no permission and no entry rule of its own: the entry is `levelReads.entry` (server/levelReads.ts).

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
