// The company's rules that tie quality, submittals and the warehouse to progress (work order 12, item 7), and the questions they ask the records.
//   qc_completion_mode    off | warn | block   a cell may be COMPLETE only after an accepted inspection of that unit and activity
//   qc_accepted_codes     the inspection response codes that count as an acceptance (default A,B)
//   material_approval_mode off | warn | block  a material may be issued only after its approval submittal was approved
// A company that never chose has the defaults (warn, A and B, warn). "block" is also enforced by the database on the table every path writes to
// (project_os_qc_completion_guard in drizzle/baseline-security.sql); the checks here give the person the reason in words before that.
import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLogs, consultantSubmittals, submittalReplyCodes, tenantPolicies } from "../drizzle/schema";
import { assertTenantManager, getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
/** Any handle that can run a select/execute: the database or a transaction on it. */
type Reader = Pick<Db, "select" | "execute">;
export type PolicyMode = "off" | "warn" | "block";
export type TenantPolicy = { qcCompletionMode: PolicyMode; qcAcceptedCodes: string[]; materialApprovalMode: PolicyMode };
export const DEFAULT_POLICY: TenantPolicy = { qcCompletionMode: "warn", qcAcceptedCodes: ["A", "B"], materialApprovalMode: "warn" };

export async function loadTenantPolicy(reader: Reader, tenantId: string): Promise<TenantPolicy> {
  const [row] = await reader.select().from(tenantPolicies).where(eq(tenantPolicies.tenantId, tenantId)).limit(1);
  if (!row) return DEFAULT_POLICY;
  return { qcCompletionMode: row.qcCompletionMode, qcAcceptedCodes: row.qcAcceptedCodes.split(",").map(code => code.trim()).filter(Boolean), materialApprovalMode: row.materialApprovalMode };
}

export async function getTenantPolicyForManager(input: { userId: number; tenantId: string }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  return loadTenantPolicy(db, input.tenantId);
}

export async function setTenantPolicyForManager(input: { userId: number; tenantId: string; qcCompletionMode: PolicyMode; qcAcceptedCodes: string[]; materialApprovalMode: PolicyMode }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const codes = Array.from(new Set(input.qcAcceptedCodes.map(code => code.trim().toUpperCase()).filter(Boolean)));
  if (!codes.length || codes.some(code => !/^[A-Z0-9]{1,4}$/.test(code)) || codes.join(",").length > 40) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_POLICY_CODES_INVALID" });
  const before = await loadTenantPolicy(db, input.tenantId);
  await db.transaction(async tx => {
    const values = { qcCompletionMode: input.qcCompletionMode, qcAcceptedCodes: codes.join(","), materialApprovalMode: input.materialApprovalMode, updatedByUserId: input.userId };
    await tx.insert(tenantPolicies).values({ id: crypto.randomUUID(), tenantId: input.tenantId, ...values }).onConflictDoUpdate({ target: tenantPolicies.tenantId, set: { ...values, updatedAt: new Date() } });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "tenant.policy_changed", entityType: "tenant_policy", entityId: input.tenantId, metadata: JSON.stringify({ before, after: { qcCompletionMode: input.qcCompletionMode, qcAcceptedCodes: codes, materialApprovalMode: input.materialApprovalMode } }) });
  });
  return { qcCompletionMode: input.qcCompletionMode, qcAcceptedCodes: codes, materialApprovalMode: input.materialApprovalMode } satisfies TenantPolicy;
}

export type CellRef = { unitId: string; activityDefinitionId: string };

/** Which of these cells have no accepted inspection (the same function the database guard calls). */
export async function cellsWithoutAcceptedInspection(reader: Reader, cells: readonly CellRef[]): Promise<CellRef[]> {
  const verdicts = await Promise.all(cells.map(async cell => {
    const result = await reader.execute(sql`SELECT project_os_cell_qc_accepted(${cell.unitId}, ${cell.activityDefinitionId}) AS ok`);
    const row = (result as unknown as { rows?: Array<{ ok: boolean }> }).rows?.[0] ?? (result as unknown as Array<{ ok: boolean }>)[0];
    return row?.ok === true;
  }));
  return cells.filter((_, index) => !verdicts[index]);
}

export type QcGate = { mode: PolicyMode; notAccepted: CellRef[] };
/** What the company's quality policy says about moving these cells to COMPLETE: the mode, and the cells that have not earned it. Empty list when the mode is off. */
export async function qcCompletionGate(reader: Reader, tenantId: string, cells: readonly CellRef[]): Promise<QcGate> {
  const policy = await loadTenantPolicy(reader, tenantId);
  if (policy.qcCompletionMode === "off" || !cells.length) return { mode: policy.qcCompletionMode, notAccepted: [] };
  return { mode: policy.qcCompletionMode, notAccepted: await cellsWithoutAcceptedInspection(reader, cells) };
}

// ------------------------------------------------------------------------------------------------------------------------ submittal reply codes

const DEFAULT_REPLY_CODES = [
  { code: "A", labelAr: "معتمد", labelEn: "Approved", approved: true },
  { code: "B", labelAr: "معتمد بملاحظات", labelEn: "Approved as noted", approved: true },
  { code: "C", labelAr: "أعد التقديم", labelEn: "Revise and resubmit", approved: false },
  { code: "D", labelAr: "مرفوض", labelEn: "Rejected", approved: false },
] as const;

/** The company's reply codes, seeded with A/B/C/D the first time anything asks. */
export async function ensureReplyCodes(db: Db, tenantId: string) {
  const existing = await db.select().from(submittalReplyCodes).where(eq(submittalReplyCodes.tenantId, tenantId));
  if (existing.length) return existing;
  await db.insert(submittalReplyCodes).values(DEFAULT_REPLY_CODES.map((item, index) => ({ id: crypto.randomUUID(), tenantId, code: item.code, labelAr: item.labelAr, labelEn: item.labelEn, approved: item.approved, sortOrder: index }))).onConflictDoNothing();
  return db.select().from(submittalReplyCodes).where(eq(submittalReplyCodes.tenantId, tenantId));
}

/** Is this material approved in this project: its latest material-approval submittal was replied to with a code that counts as an approval. */
export async function materialApprovalState(reader: Db, tenantId: string, projectId: string, materialId: string): Promise<"approved" | "not_approved" | "no_submittal"> {
  const [latest] = await reader.select({ status: consultantSubmittals.status, replyCode: consultantSubmittals.replyCode }).from(consultantSubmittals)
    .where(and(eq(consultantSubmittals.tenantId, tenantId), eq(consultantSubmittals.projectId, projectId), eq(consultantSubmittals.materialId, materialId), eq(consultantSubmittals.submittalType, "material_approval"), sql`${consultantSubmittals.status} <> 'draft'`))
    .orderBy(desc(consultantSubmittals.revision), desc(consultantSubmittals.createdAt)).limit(1);
  if (!latest) return "no_submittal";
  if (!latest.replyCode || latest.status === "sent") return "not_approved";
  const [code] = await reader.select({ approved: submittalReplyCodes.approved }).from(submittalReplyCodes).where(and(eq(submittalReplyCodes.tenantId, tenantId), eq(submittalReplyCodes.code, latest.replyCode))).limit(1);
  return code?.approved ? "approved" : "not_approved";
}
