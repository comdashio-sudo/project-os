// Presentation of what the signed-in person may do: write controls they cannot use are hidden (or the whole form is replaced by a
// one-line reason), so nobody fills in a form the server is going to refuse. The server is still the only judge: every write is
// checked there with the same snapshot (server/domain/authorization.ts), and this file only mirrors that rule to decide what to draw.
//
// Three states, deliberately different:
//   no provider      -> allowed. A component used outside a company route (and every unit test that renders one on its own) has no
//                       company to ask about; the server refuses what it must.
//   provider, loading -> NOT allowed. The controls appear only once we know, instead of flashing and being pulled away.
//   provider, failed  -> allowed. "We could not ask" is not "you may not": hiding every button because one lookup failed would
//                       turn a network blip into a locked screen. The server still refuses what it must.
import React, { createContext, useContext, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { NoPermission } from "@/components/ScreenStates";
import { trpc } from "@/lib/trpc";
import { pickLanguage } from "@/lib/language";

type Scope = { scopeType: string; scopeId: string | null };
type Summary = { member: boolean; products: readonly string[]; permissions: readonly string[]; scopes: readonly Scope[] };
type State = { status: "loading" | "ready" | "failed"; summary?: Summary };

const PermissionContext = createContext<State | null>(null);

const PRODUCT_OF_PREFIX: Record<string, string> = { project: "PROJECT", pmo: "PMO", executive: "EXECUTIVE", tenant: "EXECUTIVE" };

/** The server's rule (hasScopeAccess + assertTenantAccess), restated for one request. Exported for the unit test. */
export function summaryAllows(summary: Summary, permission: string | readonly string[], projectId?: string): boolean {
  if (!summary.member) return false;
  const accepted = typeof permission === "string" ? [permission] : permission;
  const granted = accepted.some(code => summary.permissions.includes(code) && summary.products.includes(PRODUCT_OF_PREFIX[code.split(".")[0]] ?? "PROJECT"));
  if (!granted) return false;
  if (!projectId) return true;
  return summary.scopes.some(scope => scope.scopeType === "company" || (scope.scopeType === "project" && scope.scopeId === projectId));
}

export function PermissionProvider({ tenantId, children }: { tenantId?: string; children: React.ReactNode }) {
  const query = trpc.accessSummary.mine.useQuery({ tenantId: tenantId ?? "" }, { enabled: Boolean(tenantId), staleTime: 30_000, retry: 1 });
  const state = useMemo<State>(() => query.data ? { status: "ready", summary: query.data } : query.error ? { status: "failed" } : { status: "loading" }, [query.data, query.error]);
  if (!tenantId) return <>{children}</>;
  return <PermissionContext.Provider value={state}>{children}</PermissionContext.Provider>;
}

/** True when the person holds ANY of the listed permissions (for this project, when one is given). */
export function useCan(permission: string | readonly string[], projectId?: string): boolean {
  const state = useContext(PermissionContext);
  if (!state) return true;
  if (state.status === "failed") return true;
  if (state.status === "loading" || !state.summary) return false;
  return summaryAllows(state.summary, permission, projectId);
}

/** True while the answer is still unknown, so a screen can hold its place instead of showing a "no permission" line for a moment. */
export function usePermissionsLoading(): boolean {
  const state = useContext(PermissionContext);
  return state?.status === "loading";
}

/**
 * Hides what the person cannot use. With `reason` the place is not left silent: a form is replaced by one line saying which
 * kind of permission is missing, so "where did the button go" has an answer. Row actions pass nothing and simply do not appear.
 */
export function WriteGate({ permission, projectId, reason, children }: { permission: string | readonly string[]; projectId?: string; reason?: { ar: string; en: string; ur: string }; children: React.ReactNode }) {
  const allowed = useCan(permission, projectId);
  const loading = usePermissionsLoading();
  const { isArabic, language } = useLanguage();
  if (allowed) return <>{children}</>;
  if (!reason || loading) return null;
  return <p role="note" data-write-gate="denied" className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">{pickLanguage(language, reason)}</p>;
}

/**
 * D-20 (G-160/G-161): a whole project page opened by its address without the permission its server read needs. Instead of an empty page or a pile of failed sections,
 * the translated «you do not have permission» page. Loading: nothing yet (no flash). No provider or a failed lookup: the page, as WriteGate does — the server still refuses.
 */
export function PageGate({ permission, projectId, children }: { permission: string | readonly string[]; projectId?: string; children: React.ReactNode }) {
  const allowed = useCan(permission, projectId);
  const loading = usePermissionsLoading();
  const { isArabic } = useLanguage();
  if (allowed) return <>{children}</>;
  if (loading) return null;
  return <main className="mx-auto max-w-3xl px-4 py-6" data-page-gate="denied"><NoPermission isArabic={isArabic} /></main>;
}

/** D-20 (G-144/G-163): what each page of «Project pages» needs to be read — the permission its server read checks. A link is drawn only for those who hold it. */
export const PROJECT_PAGE_PERMISSIONS = {
  baseline: ["project.read", "project.manage", "project.create"],
  team: ["project.manage", "project.team.invite"],
  pmc: ["project.pmc.read"],
  stalled: ["project.pmc.read"],
  profitability: ["project.read"],
  commercial: ["project.read"],
} as const satisfies Record<string, readonly string[]>;
