// Programme (screen 10): planned against actual by month, and the three money cards.
// Money comes from the platform's own records (the project's contract value and its
// commercial invoices), never from fields typed into PMC.
import { and, eq, sql } from "drizzle-orm";
import { projectCommercialInvoices, projects } from "../drizzle/schema";
import { programme } from "./domain/pmcScreens";
import { authorizePmcRead, loadPmcDataset } from "./pmcScreensService";

type Scope = { userId: number; tenantId: string; projectId: string };
const r2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : null);

/**
 * Amounts are the invoices' `amount` (before VAT), measured against the contract value:
 *  - paid: invoices with status `paid`;
 *  - confirmed invoicing: `issued` and `paid` (a draft or void invoice is not confirmed);
 *  - target invoicing: the baseline's planned progress to date x the contract value
 *    (null when no baseline was imported or the project has no contract value).
 */
export async function getPmcProgramme(input: Scope & { now?: Date }) {
  const db = await authorizePmcRead(input);
  const now = input.now ?? new Date();
  const [dataset, [project], totals] = await Promise.all([
    loadPmcDataset(db, input, now),
    db.select({ contractValue: projects.contractValue, currency: projects.currency }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId))).limit(1),
    db.select({ status: projectCommercialInvoices.status, total: sql<string>`COALESCE(SUM(${projectCommercialInvoices.amount}), 0)` }).from(projectCommercialInvoices).where(and(eq(projectCommercialInvoices.tenantId, input.tenantId), eq(projectCommercialInvoices.projectId, input.projectId))).groupBy(projectCommercialInvoices.status),
  ]);
  const curve = programme(dataset);
  const contractValue = Number(project?.contractValue ?? 0);
  const sum = (...statuses: string[]) => totals.filter(row => statuses.includes(row.status)).reduce((total, row) => total + Number(row.total), 0);
  const paid = sum("paid");
  const confirmed = sum("issued", "paid");
  const target = curve.plannedToDate !== null && contractValue > 0 ? (curve.plannedToDate / 100) * contractValue : null;
  return {
    ...curve,
    cards: {
      currency: project?.currency ?? "SAR",
      contractValue: r2(contractValue),
      paid: { amount: r2(paid), percent: percentOf(paid, contractValue) },
      confirmed: { amount: r2(confirmed), percent: percentOf(confirmed, contractValue) },
      target: { amount: target === null ? null : r2(target), percent: curve.plannedToDate },
    },
  };
}
