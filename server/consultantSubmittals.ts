// What the contractor sends the consultant for approval (work order 12, item 5): execution drawings, a material, a method statement, a sample. Each has a number and a
// revision, the day it was sent and the day it was answered, the answer's code (the company's own codes, A/B/C/D by default), and how many days it has sat with the consultant.
// Rules that were decisions, not facts (docs/STATE.md): who sent a submittal does not record its reply (it holds for the company owner too); only an answer whose code does not
// count as an approval is resubmitted, as a NEW revision of the same number that closes the old one; the codes are the company's to name and to say which ones approve.
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { auditLogs, consultantSubmittals, materialMasters, pmcActivityDefinitions, pmcUnits, submittalReplyCodes } from "../drizzle/schema";
import { assertProjectWithinTenant, assertTenantManager, getDb, getTenantAccessSnapshot } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { emitWebhookEvent, kickWebhookDelivery } from "./integrations/webhooks";
import { ensureReplyCodes } from "./qualityGate";

type Scope = { userId: number; tenantId: string; projectId: string };
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
const refuse = (code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN", message: string) => new TRPCError({ code, message });
export const SUBMITTAL_TYPES = ["shop_drawing", "material_approval", "method_statement", "sample"] as const;
export type SubmittalType = (typeof SUBMITTAL_TYPES)[number];
const WRITE = ["project.field.manage", "project.design.manage", "project.manage"] as const;
// Q-17 (205-4): the consultant's reply has its own power; project.manage no longer answers it
const REPLY = ["project.design.approve", "project.consultant.respond"] as const;
const READ = ["project.read", "project.field.manage", "project.design.manage", "project.design.approve", "project.manage"] as const;
const DAY = 86_400_000;

async function authorize(input: Scope, permission: readonly string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw refuse("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission, scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));
async function load(db: Db, input: Scope & { submittalId: string }) {
  const [row] = await db.select().from(consultantSubmittals).where(and(mine(consultantSubmittals, input), eq(consultantSubmittals.id, input.submittalId))).limit(1);
  if (!row) throw refuse("NOT_FOUND", "PROJECT_OS_SUBMITTAL_NOT_FOUND");
  return row;
}

export async function createConsultantSubmittalForTenant(input: Scope & { submittalType: SubmittalType; submittalNumber: string; title: string; materialId?: string; pmcUnitId?: string; pmcActivityDefinitionId?: string; dueAt?: Date; resubmissionOfId?: string; consultant?: string }) {
  const db = await authorize(input, WRITE);
  if (input.submittalType === "material_approval" && !input.materialId && !input.resubmissionOfId) throw refuse("BAD_REQUEST", "PROJECT_OS_SUBMITTAL_MATERIAL_REQUIRED");
  if (input.materialId) {
    const [material] = await db.select({ id: materialMasters.id }).from(materialMasters).where(and(eq(materialMasters.id, input.materialId), eq(materialMasters.tenantId, input.tenantId))).limit(1);
    if (!material) throw refuse("NOT_FOUND", "PROJECT_OS_MATERIAL_NOT_FOUND");
  }
  if (input.pmcUnitId) { const [unit] = await db.select({ id: pmcUnits.id }).from(pmcUnits).where(and(mine(pmcUnits, input), eq(pmcUnits.id, input.pmcUnitId))).limit(1); if (!unit) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_UNIT_NOT_FOUND"); }
  if (input.pmcActivityDefinitionId) { const [activity] = await db.select({ id: pmcActivityDefinitions.id }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions, input), eq(pmcActivityDefinitions.id, input.pmcActivityDefinitionId))).limit(1); if (!activity) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_ACTIVITY_NOT_FOUND"); }
  const codes = await ensureReplyCodes(db, input.tenantId);
  const id = crypto.randomUUID();
  let revision = 0; let number = input.submittalNumber.trim();
  await db.transaction(async tx => {
    if (input.resubmissionOfId) {
      const [original] = await tx.select().from(consultantSubmittals).where(and(mine(consultantSubmittals, input), eq(consultantSubmittals.id, input.resubmissionOfId))).for("update").limit(1);
      if (!original) throw refuse("NOT_FOUND", "PROJECT_OS_SUBMITTAL_NOT_FOUND");
      const answer = codes.find(code => code.code === original.replyCode);
      if (original.status !== "replied" || !answer || answer.approved) throw refuse("CONFLICT", "PROJECT_OS_SUBMITTAL_RESUBMISSION_INVALID");
      const [{ latest }] = await tx.select({ latest: sql<number>`max(${consultantSubmittals.revision})::int` }).from(consultantSubmittals).where(and(mine(consultantSubmittals, input), eq(consultantSubmittals.submittalNumber, original.submittalNumber)));
      revision = (latest ?? original.revision) + 1; number = original.submittalNumber;
      await tx.update(consultantSubmittals).set({ status: "closed" }).where(eq(consultantSubmittals.id, original.id));
      await tx.insert(consultantSubmittals).values({ id, tenantId: input.tenantId, projectId: input.projectId, submittalType: original.submittalType, submittalNumber: number, revision, title: input.title, materialId: original.materialId, pmcUnitId: input.pmcUnitId ?? original.pmcUnitId, pmcActivityDefinitionId: input.pmcActivityDefinitionId ?? original.pmcActivityDefinitionId, consultant: input.consultant?.trim() || original.consultant, discipline: original.discipline, drawingId: original.drawingId, dueAt: input.dueAt, createdByUserId: input.userId });
    } else {
      const [clash] = await tx.select({ id: consultantSubmittals.id }).from(consultantSubmittals).where(and(mine(consultantSubmittals, input), eq(consultantSubmittals.submittalNumber, number))).limit(1);
      if (clash) throw refuse("CONFLICT", "PROJECT_OS_SUBMITTAL_NUMBER_EXISTS");
      await tx.insert(consultantSubmittals).values({ id, tenantId: input.tenantId, projectId: input.projectId, submittalType: input.submittalType, submittalNumber: number, revision, title: input.title, materialId: input.materialId, pmcUnitId: input.pmcUnitId, pmcActivityDefinitionId: input.pmcActivityDefinitionId, dueAt: input.dueAt, consultant: input.consultant?.trim() || null, createdByUserId: input.userId });
    }
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: input.resubmissionOfId ? "submittal.resubmitted" : "submittal.created", entityType: "consultant_submittal", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, submittalNumber: number, revision, submittalType: input.resubmissionOfId ? undefined : input.submittalType }) });
  });
  return { id, submittalNumber: number, revision, status: "draft" as const };
}

export async function sendConsultantSubmittalForTenant(input: Scope & { submittalId: string; sentAt?: Date }) {
  const db = await authorize(input, WRITE);
  const row = await load(db, input);
  const sentAt = input.sentAt ?? new Date();
  if (sentAt.getTime() > Date.now() + DAY) throw refuse("BAD_REQUEST", "PROJECT_OS_SUBMITTAL_DATE_FUTURE");
  await db.transaction(async tx => {
    const changed = await tx.update(consultantSubmittals).set({ status: "sent", sentAt, sentByUserId: input.userId }).where(and(eq(consultantSubmittals.id, row.id), eq(consultantSubmittals.status, "draft"))).returning({ id: consultantSubmittals.id });
    if (!changed.length) throw refuse("CONFLICT", "PROJECT_OS_SUBMITTAL_TRANSITION_INVALID");
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "submittal.sent", entityType: "consultant_submittal", entityId: row.id, metadata: JSON.stringify({ projectId: input.projectId, submittalNumber: row.submittalNumber, revision: row.revision }) });
  });
  return { id: row.id, status: "sent" as const, sentAt };
}

export async function replyConsultantSubmittalForTenant(input: Scope & { submittalId: string; replyCode: string; replyNote?: string; repliedAt?: Date }) {
  const db = await authorize(input, REPLY);
  const row = await load(db, input);
  if (row.status !== "sent") throw refuse("CONFLICT", "PROJECT_OS_SUBMITTAL_TRANSITION_INVALID");
  if (row.sentByUserId === input.userId) throw refuse("CONFLICT", "PROJECT_OS_SUBMITTAL_SELF_REPLY");
  const code = (await ensureReplyCodes(db, input.tenantId)).find(item => item.code === input.replyCode.trim().toUpperCase());
  if (!code || !code.active) throw refuse("BAD_REQUEST", "PROJECT_OS_SUBMITTAL_REPLY_CODE_UNKNOWN");
  const repliedAt = input.repliedAt ?? new Date();
  if (row.sentAt && repliedAt < row.sentAt) throw refuse("BAD_REQUEST", "PROJECT_OS_SUBMITTAL_REPLY_BEFORE_SENT");
  await db.transaction(async tx => {
    const changed = await tx.update(consultantSubmittals).set({ status: "replied", replyCode: code.code, replyNote: input.replyNote?.trim() || null, repliedAt, repliedByUserId: input.userId }).where(and(eq(consultantSubmittals.id, row.id), eq(consultantSubmittals.status, "sent"))).returning({ id: consultantSubmittals.id });
    if (!changed.length) throw refuse("CONFLICT", "PROJECT_OS_SUBMITTAL_TRANSITION_INVALID");
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "submittal.replied", entityType: "consultant_submittal", entityId: row.id, metadata: JSON.stringify({ projectId: input.projectId, submittalNumber: row.submittalNumber, revision: row.revision, replyCode: code.code, approved: code.approved }) });
    await emitWebhookEvent(tx, input.tenantId, "submittal.replied", { submittalId: row.id, projectId: input.projectId, submittalNumber: row.submittalNumber, revision: row.revision, replyCode: code.code, approved: code.approved });
  });
  kickWebhookDelivery();
  return { id: row.id, status: "replied" as const, replyCode: code.code, approved: code.approved };
}

export async function closeConsultantSubmittalForTenant(input: Scope & { submittalId: string }) {
  const db = await authorize(input, WRITE);
  const row = await load(db, input);
  await db.transaction(async tx => {
    const changed = await tx.update(consultantSubmittals).set({ status: "closed" }).where(and(eq(consultantSubmittals.id, row.id), eq(consultantSubmittals.status, "replied"))).returning({ id: consultantSubmittals.id });
    if (!changed.length) throw refuse("CONFLICT", "PROJECT_OS_SUBMITTAL_TRANSITION_INVALID");
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "submittal.closed", entityType: "consultant_submittal", entityId: row.id, metadata: JSON.stringify({ projectId: input.projectId, submittalNumber: row.submittalNumber, revision: row.revision }) });
  });
  return { id: row.id, status: "closed" as const };
}

/** The register: each submittal with how long it has sat (or sat) with the consultant, and whether it is late. */
export async function listConsultantSubmittalsForTenant(input: Scope & { status?: "draft" | "sent" | "replied" | "closed"; submittalType?: SubmittalType; now?: Date }) {
  const db = await authorize(input, READ);
  const now = input.now ?? new Date();
  const [rows, codes] = await Promise.all([
    db.select().from(consultantSubmittals).where(and(mine(consultantSubmittals, input), input.status ? eq(consultantSubmittals.status, input.status) : undefined, input.submittalType ? eq(consultantSubmittals.submittalType, input.submittalType) : undefined)).orderBy(desc(consultantSubmittals.createdAt)).limit(500),
    ensureReplyCodes(db, input.tenantId),
  ]);
  const approved = new Map(codes.map(code => [code.code, code.approved]));
  return rows.map(row => {
    const daysAtConsultant = row.sentAt ? Math.max(0, Math.floor(((row.repliedAt ?? now).getTime() - row.sentAt.getTime()) / DAY)) : null;
    return { ...row, daysAtConsultant, overdue: row.status === "sent" && row.dueAt !== null && row.dueAt < now, approved: row.replyCode ? (approved.get(row.replyCode) ?? null) : null };
  });
}

/** Urdu names of the four default reply codes. The codes are stored per company, so a company's own code keeps its English name. */
const REPLY_CODE_LABEL_UR: Record<string, string> = { A: "منظور", B: "تبصروں کے ساتھ منظور", C: "نظرِ ثانی کر کے دوبارہ جمع کریں", D: "مسترد" };
export const replyCodeLabelUr = (code: string, labelEn: string) => REPLY_CODE_LABEL_UR[code] ?? labelEn;

export async function listSubmittalReplyCodesForTenant(input: Scope) {
  const db = await authorize(input, READ);
  return (await ensureReplyCodes(db, input.tenantId)).sort((a, b) => a.sortOrder - b.sortOrder).map(row => ({ ...row, labelUr: replyCodeLabelUr(row.code, row.labelEn) }));
}

/** The company names its own reply codes and says which ones approve. At least one must approve and one must not (else the register could not tell a refusal). */
export async function saveSubmittalReplyCodesForManager(input: { userId: number; tenantId: string; codes: Array<{ code: string; labelAr: string; labelEn: string; approved: boolean; active: boolean }> }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const codes = input.codes.map((item, index) => ({ ...item, code: item.code.trim().toUpperCase(), sortOrder: index }));
  if (codes.some(item => !/^[A-Z0-9]{1,4}$/.test(item.code)) || new Set(codes.map(item => item.code)).size !== codes.length) throw refuse("BAD_REQUEST", "PROJECT_OS_SUBMITTAL_CODES_INVALID");
  const live = codes.filter(item => item.active);
  if (!live.some(item => item.approved) || !live.some(item => !item.approved)) throw refuse("BAD_REQUEST", "PROJECT_OS_SUBMITTAL_CODES_NEED_BOTH");
  await ensureReplyCodes(db, input.tenantId);
  await db.transaction(async tx => {
    for (const item of codes) {
      await tx.insert(submittalReplyCodes).values({ id: crypto.randomUUID(), tenantId: input.tenantId, code: item.code, labelAr: item.labelAr, labelEn: item.labelEn, approved: item.approved, sortOrder: item.sortOrder, active: item.active })
        .onConflictDoUpdate({ target: [submittalReplyCodes.tenantId, submittalReplyCodes.code], set: { labelAr: item.labelAr, labelEn: item.labelEn, approved: item.approved, sortOrder: item.sortOrder, active: item.active, updatedAt: new Date() } });
    }
    // a code left out of the list is retired, not deleted: submittals already answered with it keep their meaning
    await tx.update(submittalReplyCodes).set({ active: false }).where(and(eq(submittalReplyCodes.tenantId, input.tenantId), sql`${submittalReplyCodes.code} NOT IN (${sql.join(codes.map(item => sql`${item.code}`), sql`, `)})`));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "tenant.submittal_codes_changed", entityType: "submittal_reply_codes", entityId: input.tenantId, metadata: JSON.stringify({ codes: codes.map(item => ({ code: item.code, approved: item.approved, active: item.active })) }) });
  });
  return (await ensureReplyCodes(db, input.tenantId)).sort((a, b) => a.sortOrder - b.sortOrder);
}

