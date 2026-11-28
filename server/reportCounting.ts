// Q-71 (2): which daily reports the figures count. With the company rule «daily reports need approval» on, only approved reports count (as before); off (the
// default), a sent report is final, so a report sent and still waiting from before the rule was off counts too — computed here, no report row is rewritten.
// A rejected or draft report never counts. «Include unapproved» (the period screens' own switch) counts everything sent, as before.
import { inArray, ne, sql, type SQL } from "drizzle-orm";
import { siteDailyReports } from "../drizzle/schema";
import { loadTenantPolicy } from "./qualityGate";

type Reader = Parameters<typeof loadTenantPolicy>[0];

/** The statuses the figures count for this company. */
export async function countedReportStatuses(reader: Reader, tenantId: string): Promise<Array<"approved" | "submitted">> {
  const policy = await loadTenantPolicy(reader, tenantId);
  return policy.dailyReportApproval ? ["approved"] : ["approved", "submitted"];
}

/** The condition on site_daily_reports.status for the figures (approval rule, or the screen's «include unapproved»). */
export async function countedReportCondition(reader: Reader, tenantId: string, includeUnapproved?: boolean): Promise<SQL> {
  if (includeUnapproved) return ne(siteDailyReports.status, "rejected") as SQL;
  const statuses = await countedReportStatuses(reader, tenantId);
  return statuses.length === 1 ? sql`${siteDailyReports.status} = 'approved'` : inArray(siteDailyReports.status, statuses) as SQL;
}

/** Does this company's daily report wait for an approver? */
export async function reportsNeedApproval(reader: Reader, tenantId: string): Promise<boolean> {
  return (await loadTenantPolicy(reader, tenantId)).dailyReportApproval;
}
