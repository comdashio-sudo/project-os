// Work order 23, P-17 (D-42 a): a project's profile and the companies taking part in it.
//   - getProjectProfile / saveProjectProfile: location, contract number, the client, consultant and contractor with their logos, the working week and hours, the report prefix;
//   - listProjectCompanies / saveProjectCompany / deactivateProjectCompany: the main contractor (one active at most: the partial unique index decides, not this file) and subcontractors.
// Reading takes project.read or project.manage on the project; writing takes project.manage on the project. The audit row is written in the same transaction as the change.
// A logo comes in through the direct upload (purpose «logo», scoped to this company and project), is checked here (2 MB, PNG/JPEG/SVG by content, an SVG with script refused),
// is stored for good under uploads/{tenant}/{project}/logo/ and is shown by a signed link that lasts 900 seconds.
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLogs, projectCompanies, projectProfiles } from "../drizzle/schema";
import { assertProjectWithinTenant, getDb, getTenantAccessSnapshot } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { takeDirectUpload } from "./directUploadKeys";
import { storageDelete, storageGetSignedUrl, storagePut } from "./storage";

type Scope = { userId: number; tenantId: string; projectId: string };
const READ = ["project.read", "project.manage"] as const;
const WRITE = ["project.manage"] as const;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const LOGO_PARTIES = ["client", "consultant", "contractor"] as const;
export type LogoParty = (typeof LOGO_PARTIES)[number];
const LOGO_COLUMN = { client: "clientLogoKey", consultant: "consultantLogoKey", contractor: "contractorLogoKey" } as const;

async function gate(input: Scope, permission: readonly string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission, scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));
const invalid = (detail: string) => new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PROJECT_PROFILE_INVALID", cause: { issues: [{ code: detail }] } });
/** A unique violation (23505) of the named index, wherever drizzle put the driver's error. */
function violates(error: unknown, constraint: string) {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth++, current = (current as { cause?: unknown }).cause) {
    const { code, constraint: name } = current as { code?: string; constraint?: string };
    if (code === "23505" && (!name || name === constraint)) return true;
  }
  return false;
}

// ------------------------------------------------------------------ the logo

/** PNG, JPEG or SVG by the bytes themselves (the declared type is the browser's word only). */
export function logoKind(bytes: Buffer): "png" | "jpeg" | "svg" | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  const head = bytes.subarray(0, 4096).toString("utf8").replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "svg";
  return null;
}
/** An SVG is shown as an image, but opened on its own it is a document: script, event handlers, javascript: links and embedded HTML are refused, not cleaned. */
export const svgIsUnsafe = (text: string) => /<\s*script\b|\son[a-z]+\s*=|javascript\s*:|<\s*foreignObject\b|<\s*(iframe|embed|object)\b/i.test(text);

async function takeLogo(input: Scope, uploadKey: string) {
  const taken = await takeDirectUpload({ tenantId: input.tenantId, projectId: input.projectId, purpose: "logo", uploadKey });
  const refuse = async (message: string) => { await taken.discard(); return new TRPCError({ code: "BAD_REQUEST", message }); };
  if (taken.bytes.length > MAX_LOGO_BYTES) throw await refuse("PROJECT_OS_PROJECT_LOGO_TOO_LARGE");
  const kind = logoKind(taken.bytes);
  if (!kind) throw await refuse("PROJECT_OS_PROJECT_LOGO_TYPE_INVALID");
  if (kind === "svg" && svgIsUnsafe(taken.bytes.toString("utf8"))) throw await refuse("PROJECT_OS_PROJECT_LOGO_UNSAFE");
  const contentType = kind === "svg" ? "image/svg+xml" : `image/${kind}`;
  const stored = await storagePut(`uploads/${input.tenantId}/${input.projectId}/logo/${randomUUID()}.${kind === "jpeg" ? "jpg" : kind}`, taken.bytes, contentType);
  await taken.discard();
  return stored.key;
}

// ------------------------------------------------------------------ the profile

export type ProjectProfileInput = Scope & {
  location: string | null; contractNumber: string | null; clientName: string | null; consultantName: string | null; contractorName: string | null;
  workDays: number[]; workStart: string | null; workEnd: string | null; reportPrefix: string | null;
  /** per party: left out = keep the logo, null = remove it, { uploadKey } = replace it with the uploaded file */
  logos?: Partial<Record<LogoParty, { uploadKey: string } | null>>;
};
const hhmm = (value: string | null) => (value ? value.slice(0, 5) : null);
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

/** The rules the table's CHECK constraints hold, said here first so the person gets one translated message instead of a database error. */
export function profileIssue(input: Pick<ProjectProfileInput, "workDays" | "workStart" | "workEnd" | "reportPrefix">): string | null {
  if (!input.workDays.length || input.workDays.some(day => !Number.isInteger(day) || day < 0 || day > 6) || new Set(input.workDays).size !== input.workDays.length) return "WORK_DAYS_INVALID";
  if ((input.workStart === null) !== (input.workEnd === null)) return "WORK_HOURS_INCOMPLETE";
  if (input.workStart !== null && input.workEnd !== null) {
    if (![input.workStart, input.workEnd].every(value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value))) return "WORK_HOURS_INVALID";
    if (minutes(input.workStart) >= minutes(input.workEnd)) return "WORK_HOURS_REVERSED";
  }
  if (input.reportPrefix !== null && !/^[A-Z0-9][A-Z0-9-]{0,15}$/.test(input.reportPrefix)) return "REPORT_PREFIX_INVALID";
  return null;
}

export async function getProjectProfile(input: Scope) {
  const db = await gate(input, READ);
  const [row] = await db.select().from(projectProfiles).where(mine(projectProfiles, input)).limit(1);
  const logo = async (key: string | null | undefined) => (key ? { key, url: await storageGetSignedUrl(key).catch(() => null) } : null);
  return {
    projectId: input.projectId,
    location: row?.location ?? null, contractNumber: row?.contractNumber ?? null,
    clientName: row?.clientName ?? null, consultantName: row?.consultantName ?? null, contractorName: row?.contractorName ?? null,
    logos: { client: await logo(row?.clientLogoKey), consultant: await logo(row?.consultantLogoKey), contractor: await logo(row?.contractorLogoKey) },
    workDays: (row?.workDays ?? "01234").split("").map(Number),
    workStart: hhmm(row?.workStart ?? null), workEnd: hhmm(row?.workEnd ?? null), reportPrefix: row?.reportPrefix ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function saveProjectProfile(input: ProjectProfileInput) {
  const db = await gate(input, WRITE);
  const issue = profileIssue(input);
  if (issue) throw invalid(issue);
  const [current] = await db.select().from(projectProfiles).where(mine(projectProfiles, input)).limit(1);
  // the new logos are read, checked and stored before the transaction; if the transaction fails they are removed again
  const stored: Partial<Record<LogoParty, string>> = {};
  try {
    for (const party of LOGO_PARTIES) { const change = input.logos?.[party]; if (change) stored[party] = await takeLogo(input, change.uploadKey); }
  } catch (error) { await Promise.all(Object.values(stored).map(key => storageDelete(key).catch(() => undefined))); throw error; }
  const logoKeys = Object.fromEntries(LOGO_PARTIES.map(party => {
    const change = input.logos?.[party];
    return [LOGO_COLUMN[party], change === undefined ? current?.[LOGO_COLUMN[party]] ?? null : change === null ? null : stored[party]!];
  })) as Record<(typeof LOGO_COLUMN)[LogoParty], string | null>;
  const values = {
    location: input.location, contractNumber: input.contractNumber, clientName: input.clientName, consultantName: input.consultantName, contractorName: input.contractorName,
    ...logoKeys, workDays: [...input.workDays].sort((a, b) => a - b).join(""), workStart: input.workStart, workEnd: input.workEnd, reportPrefix: input.reportPrefix, updatedByUserId: input.userId,
  };
  try {
    await db.transaction(async tx => {
      if (current) await tx.update(projectProfiles).set({ ...values, updatedAt: new Date() }).where(and(mine(projectProfiles, input), eq(projectProfiles.id, current.id)));
      else await tx.insert(projectProfiles).values({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, ...values });
      await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.profile_saved", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ created: !current, logos: Object.fromEntries(LOGO_PARTIES.map(party => [party, input.logos?.[party] === undefined ? "kept" : input.logos[party] === null ? "removed" : "replaced"])) }) });
    });
  } catch (error) { await Promise.all(Object.values(stored).map(key => storageDelete(key).catch(() => undefined))); throw error; }
  // the logos this save replaced or removed are no longer referenced
  for (const party of LOGO_PARTIES) { const old = current?.[LOGO_COLUMN[party]]; if (old && input.logos?.[party] !== undefined) await storageDelete(old).catch(() => undefined); }
  return getProjectProfile(input);
}

// ------------------------------------------------------------------ the companies on the project

export type ProjectCompanyRole = "main" | "sub";

export async function listProjectCompanies(input: Scope) {
  const db = await gate(input, READ);
  return db.select({ id: projectCompanies.id, name: projectCompanies.name, role: projectCompanies.role, active: projectCompanies.active, createdAt: projectCompanies.createdAt })
    .from(projectCompanies).where(mine(projectCompanies, input)).orderBy(asc(projectCompanies.role), asc(projectCompanies.name)) as Promise<Array<{ id: string; name: string; role: ProjectCompanyRole; active: boolean; createdAt: Date }>>;
}

/** Adds a company (no id) or renames / re-roles one (id). A second active main contractor is refused by the database's partial unique index. */
export async function saveProjectCompany(input: Scope & { id?: string; name: string; role: ProjectCompanyRole }) {
  const db = await gate(input, WRITE);
  const name = input.name.trim();
  if (!name) throw invalid("COMPANY_NAME_MISSING");
  const id = input.id ?? randomUUID();
  try {
    await db.transaction(async tx => {
      if (input.id) {
        const updated = await tx.update(projectCompanies).set({ name, role: input.role, updatedAt: new Date() }).where(and(mine(projectCompanies, input), eq(projectCompanies.id, input.id))).returning({ id: projectCompanies.id });
        if (!updated.length) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PROJECT_COMPANY_NOT_FOUND" });
      } else await tx.insert(projectCompanies).values({ id, tenantId: input.tenantId, projectId: input.projectId, name, role: input.role });
      await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: input.id ? "project.company_updated" : "project.company_added", entityType: "project_company", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, role: input.role }) });
    });
  } catch (error) {
    if (violates(error, "project_companies_one_active_main")) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_PROJECT_MAIN_CONTRACTOR_EXISTS" });
    throw error;
  }
  return { id };
}

/** A company is never deleted (reports will name it); it is made inactive, which also frees the main-contractor place. */
export async function deactivateProjectCompany(input: Scope & { id: string }) {
  const db = await gate(input, WRITE);
  await db.transaction(async tx => {
    const updated = await tx.update(projectCompanies).set({ active: false, updatedAt: new Date() }).where(and(mine(projectCompanies, input), eq(projectCompanies.id, input.id))).returning({ id: projectCompanies.id });
    if (!updated.length) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PROJECT_COMPANY_NOT_FOUND" });
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.company_deactivated", entityType: "project_company", entityId: input.id, metadata: JSON.stringify({ projectId: input.projectId }) });
  });
  return { id: input.id, active: false };
}
