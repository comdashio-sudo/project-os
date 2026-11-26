// Q-59 (3): the quick search (Ctrl+K) of a project — a villa by its number or label, a daily report by its date, a PMC activity by its code or name.
// Each source is read through the gate its own screen uses (the PMC read for villas and activities, the daily report's readers for reports), so a
// person finds only what they could already open; a source they may not read is left out (never an error for the whole search). The pages of the
// menu are matched in the browser from the side menu the server already filtered. Read-only, at most a few rows per source.
import { TRPCError } from "@trpc/server";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { pmcActivityDefinitions, pmcUnits } from "../drizzle/schema";
import { authorize as authorizePmc, mine } from "./pmcService";
import { listSiteDailyReportsForTenant } from "./siteReports";

export type QuickSearchHit = { kind: "villa" | "report" | "activity"; label: string; detail: string | null; href: string };
type Scope = { userId: number; tenantId: string; projectId: string };

const PER_SOURCE = 6;
/** «%» and «_» typed by the person are searched as themselves, not as patterns */
const like = (text: string) => `%${text.replace(/[\\%_]/g, char => `\\${char}`)}%`;
/** A calendar day typed as 2026-11-20 (or 2026/11/20); anything else is not a date */
export function dayOf(query: string): string | null {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(query.trim());
  if (!match) return null;
  const day = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day ? null : day;
}
/** Arabic-Indic and Persian digits read as the digits they are */
const westernDigits = (text: string) => text.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));

/** A source the person may not read answers nothing; any other failure is the search's own */
async function gated<T>(read: () => Promise<T[]>): Promise<T[]> {
  try { return await read(); } catch (error) { if (error instanceof TRPCError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) return []; throw error; }
}

export async function quickSearch(input: Scope & { query: string }): Promise<{ hits: QuickSearchHit[] }> {
  const query = westernDigits(input.query.trim());
  if (query.length < 1) return { hits: [] };
  const base = `/projects/${input.tenantId}/${input.projectId}`;
  const scope = { userId: input.userId, tenantId: input.tenantId, projectId: input.projectId };
  const day = dayOf(query);
  const number = /^\d{1,6}$/.test(query) ? Number(query) : null;

  const [villas, activities, reports] = await Promise.all([
    gated(async () => {
      const db = await authorizePmc(scope, "project.pmc.read");
      const rows = await db.select({ unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, modelCode: pmcUnits.modelCode }).from(pmcUnits)
        .where(and(mine(pmcUnits, scope), number !== null ? or(eq(pmcUnits.unitNumber, number), ilike(pmcUnits.villaLabel, like(query))) : ilike(pmcUnits.villaLabel, like(query))))
        .orderBy(asc(pmcUnits.unitNumber)).limit(PER_SOURCE);
      return rows.map(row => ({ kind: "villa" as const, label: row.villaLabel ?? String(row.unitNumber), detail: row.modelCode, href: `/m/${input.tenantId}/${input.projectId}/unit/${row.unitNumber}` }));
    }),
    number !== null || day ? Promise.resolve([] as QuickSearchHit[]) : gated(async () => {
      const db = await authorizePmc(scope, "project.pmc.read");
      const rows = await db.selectDistinct({ code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name }).from(pmcActivityDefinitions)
        .where(and(mine(pmcActivityDefinitions, scope), or(ilike(pmcActivityDefinitions.code, like(query)), ilike(pmcActivityDefinitions.name, like(query)))))
        .orderBy(asc(pmcActivityDefinitions.code)).limit(PER_SOURCE);
      return rows.map(row => ({ kind: "activity" as const, label: row.code, detail: row.name, href: `${base}/pmc?tab=activities&q=${encodeURIComponent(row.code)}` }));
    }),
    !day ? Promise.resolve([] as QuickSearchHit[]) : gated(async () => {
      const rows = await listSiteDailyReportsForTenant({ ...scope, from: day, to: day });
      return rows.slice(0, PER_SOURCE).map(row => ({ kind: "report" as const, label: String(row.reportDate).slice(0, 10), detail: row.label ?? row.status, href: `/m/${input.tenantId}/${input.projectId}/report?date=${String(row.reportDate).slice(0, 10)}` }));
    }),
  ]);
  return { hits: [...villas, ...reports, ...activities] };
}
