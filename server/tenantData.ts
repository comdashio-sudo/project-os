// A company's right to take its data with it, and to have it erased: export every row it owns, and delete them permanently
// behind two separate confirmations, with a report that proves what is gone.
//
// Nothing here names a business table. The tables a company owns are READ FROM THE SCHEMA (every table with a tenantId column, plus the
// few child tables that reach their company through a parent), so a table added next month is exported and erased without anyone
// remembering to list it — and a table nobody classified makes both operations REFUSE to run rather than leave something behind
// (assertSchemaClassified). That refusal is the guard; server/tenantData.database.test.ts proves it against the real schema.
//
// What erasure keeps, on purpose, and says so in the report:
//   - audit_logs: the audit trail is append-only by design (the application account holds SELECT and INSERT on it, never DELETE), so
//     the rows stay, and the report ends with one more row recording the erasure itself;
//   - the `companies` row, as a tombstone (status archived, name and slug replaced): audit rows point at it by foreign key;
//   - the `users` rows that audit rows point at, scrubbed of every personal identifier (name, e-mail, sign-in identity) when the
//     person belongs to no other company. A person who is a member of another company is left exactly as they are.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { getDb } from "./db";
import { logError } from "./_core/logger";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Child tables hold no tenantId; they reach the company through a parent that does. Declared here, and checked against the schema. */
export const TENANT_CHILD_TABLES = [
  { table: "data_import_errors", parent: "data_imports", column: "importId" },
  { table: "data_import_row_results", parent: "data_imports", column: "importId" },
  { table: "membership_roles", parent: "memberships", column: "membershipId" },
  { table: "role_permissions", parent: "roles", column: "roleId" },
  { table: "subcontract_certificate_lines", parent: "subcontract_certificates", column: "certificateId" },
  { table: "tenant_license_feature_overrides", parent: "tenant_licenses", column: "tenantLicenseId" },
] as const;

/** Tables with no tenantId that are not a company's data: the product's catalogue, the platform's own bookkeeping, or a person's identity. */
export const NOT_COMPANY_DATA = [
  "__drizzle_migrations", // migration bookkeeping
  "commercial_features", "commercial_plans", "plan_feature_entitlements", // the plan catalogue, shared by every company
  "permissions", // the permission catalogue, shared by every company
  "scheduled_jobs", "invoice_counters", // platform bookkeeping
  "users", "auth_sessions", "login_codes", "self_service_signup_attempts", // people, handled by the scrub step
  "companies", // kept as a tombstone
] as const;

/** Kept on purpose when a company is erased. */
export const RETAINED_TENANT_TABLES = ["audit_logs"] as const;

/** Columns never written to an export: they authorise something and are not the company's information. */
export const REDACTED_COLUMNS: Record<string, string[]> = { membership_invitations: ["tokenHash"] };

/** Tables whose rows point at a stored file; erasure removes the file too. column = where the object key is. */
export const FILE_TABLES = [
  { table: "document_versions", column: "storageKey" },
  { table: "master_plan_versions", column: "storageKey" },
  { table: "data_imports", column: "fileKey" },
  { table: "pmc_site_plans", column: "fileKey" },
] as const;

/** Memberships and roles go last, so a half-finished erasure can still be resumed by the owner who started it. */
const IDENTITY_TABLES = ["membership_roles", "role_permissions", "memberships", "roles"];

export const EXPORT_FRESH_DAYS = 7;
export const DELETION_TOKEN_TTL_MS = 15 * 60 * 1000;
const PAGE = 2000;
const DELETE_BATCH = 5000;

const q = async <T = Record<string, unknown>>(db: Db, statement: ReturnType<typeof sql>): Promise<T[]> => {
  const result = (await db.execute(statement)) as unknown as [T[], unknown];
  return result[0];
};
const affected = async (db: Db, statement: ReturnType<typeof sql>) => {
  const result = (await db.execute(statement)) as unknown as [{ affectedRows?: number }, unknown];
  return Number(result[0]?.affectedRows ?? 0);
};
const id = (name: string) => sql.identifier(name);

export type SchemaMap = {
  /** every table with a tenantId column, in the order rows can be deleted without breaking a foreign key (children first) */
  tenantTables: string[];
  deletionOrder: string[];
  primaryKeys: Record<string, string[]>;
  columns: Record<string, string[]>;
  unclassified: string[];
  /** a foreign key from a table that is not company data (or a child) INTO company data: erasing would orphan or be refused */
  strayReferences: string[];
};

export async function readSchemaMap(db: Db): Promise<SchemaMap> {
  const tables = (await q<{ t: string }>(db, sql`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`)).map(row => row.t);
  const columnRows = await q<{ t: string; c: string }>(db, sql`SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position`);
  const columns: Record<string, string[]> = {};
  for (const row of columnRows) (columns[row.t] ??= []).push(row.c);
  const keyRows = await q<{ t: string; c: string }>(db, sql`SELECT table_name AS t, column_name AS c FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND constraint_name = 'PRIMARY' ORDER BY table_name, ordinal_position`);
  const primaryKeys: Record<string, string[]> = {};
  for (const row of keyRows) (primaryKeys[row.t] ??= []).push(row.c);
  const fkRows = await q<{ t: string; r: string }>(db, sql`SELECT DISTINCT table_name AS t, referenced_table_name AS r FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL`);

  const childNames = new Set<string>(TENANT_CHILD_TABLES.map(child => child.table));
  const notCompany = new Set<string>(NOT_COMPANY_DATA);
  const tenantTables = tables.filter(table => columns[table]?.includes("tenantId"));
  const tenantSet = new Set(tenantTables);
  const unclassified = tables.filter(table => !tenantSet.has(table) && !childNames.has(table) && !notCompany.has(table));
  // the declared children must still look like children (parent exists with a tenantId, the column exists)
  for (const child of TENANT_CHILD_TABLES) {
    if (!columns[child.table]?.includes(child.column) || !tenantSet.has(child.parent)) unclassified.push(`${child.table} (declared child no longer matches the schema)`);
  }
  const companyData = new Set<string>([...tenantTables, ...Array.from(childNames)]);
  const strayReferences = fkRows.filter(edge => companyData.has(edge.r) && !companyData.has(edge.t) && !["companies", "users"].includes(edge.t)).map(edge => `${edge.t} -> ${edge.r}`);

  // Kahn: a table can be deleted once nothing else that still exists points at it.
  const live = new Set<string>(tenantTables.filter(table => !(RETAINED_TENANT_TABLES as readonly string[]).includes(table)));
  const pointsAt = new Map<string, Set<string>>(); // referenced -> tables that reference it
  for (const edge of fkRows) if (live.has(edge.t) && live.has(edge.r) && edge.t !== edge.r) (pointsAt.get(edge.r) ?? pointsAt.set(edge.r, new Set()).get(edge.r)!).add(edge.t);
  const remaining = new Set(live); const order: string[] = [];
  while (remaining.size) {
    const ready = Array.from(remaining).filter(table => !Array.from(pointsAt.get(table) ?? []).some(referrer => remaining.has(referrer))).sort();
    if (!ready.length) throw new Error(`PROJECT_OS_TENANT_SCHEMA_CYCLE: ${Array.from(remaining).sort().join(", ")}`);
    for (const table of ready) { order.push(table); remaining.delete(table); }
  }
  const deletionOrder = [...order.filter(table => !IDENTITY_TABLES.includes(table)), ...IDENTITY_TABLES.filter(table => order.includes(table) || childNames.has(table))];
  return { tenantTables, deletionOrder, primaryKeys, columns, unclassified, strayReferences };
}

/** Refuses to export or erase while any table is unaccounted for. Cheap, and it runs on every call. */
export function assertSchemaClassified(map: SchemaMap) {
  if (map.unclassified.length || map.strayReferences.length) {
    logError("tenant_data.schema_unclassified", new Error([...map.unclassified, ...map.strayReferences].join("; "))); // table names only, never a value
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PROJECT_OS_TENANT_SCHEMA_UNCLASSIFIED" });
  }
}

const childFor = (table: string) => TENANT_CHILD_TABLES.find(child => child.table === table);

async function countRows(db: Db, tenantId: string, table: string): Promise<number> {
  const child = childFor(table);
  const rows = child
    ? await q<{ n: number }>(db, sql`SELECT COUNT(*) AS n FROM ${id(table)} c INNER JOIN ${id(child.parent)} p ON c.${id(child.column)} = p.id WHERE p.tenantId = ${tenantId}`)
    : await q<{ n: number }>(db, sql`SELECT COUNT(*) AS n FROM ${id(table)} WHERE tenantId = ${tenantId}`);
  return Number(rows[0]?.n ?? 0);
}

export type TenantCounts = { tables: Array<{ table: string; rows: number }>; totalRows: number; auditRows: number; files: number; usersToScrub: number };

export async function countTenantData(db: Db, tenantId: string, map?: SchemaMap): Promise<TenantCounts> {
  const schema = map ?? await readSchemaMap(db);
  assertSchemaClassified(schema);
  const names = [...TENANT_CHILD_TABLES.map(child => child.table), ...schema.deletionOrder.filter(table => !TENANT_CHILD_TABLES.some(child => child.table === table))];
  const tables: Array<{ table: string; rows: number }> = [];
  for (const table of names) tables.push({ table, rows: await countRows(db, tenantId, table) });
  const auditRows = await countRows(db, tenantId, "audit_logs");
  let files = 0;
  for (const file of FILE_TABLES) files += Number((await q<{ n: number }>(db, sql`SELECT COUNT(*) AS n FROM ${id(file.table)} WHERE tenantId = ${tenantId} AND ${id(file.column)} IS NOT NULL`))[0]?.n ?? 0);
  const usersToScrub = (await personIdsOnlyIn(db, tenantId)).length;
  return { tables, totalRows: tables.reduce((sum, item) => sum + item.rows, 0), auditRows, files, usersToScrub };
}

/** People who belong to this company and to no other: their identity is scrubbed when the company is erased. */
async function personIdsOnlyIn(db: Db, tenantId: string): Promise<number[]> {
  const rows = await q<{ userId: number }>(db, sql`SELECT m.userId AS userId FROM memberships m WHERE m.tenantId = ${tenantId} AND NOT EXISTS (SELECT 1 FROM memberships o WHERE o.userId = m.userId AND o.tenantId <> ${tenantId})`);
  return rows.map(row => Number(row.userId));
}

/** Only the person who holds the TENANT_OWNER role at company scope on an active membership. */
export async function assertTenantOwner(db: Db, userId: number, tenantId: string) {
  const rows = await q(db, sql`SELECT 1 AS ok FROM memberships m INNER JOIN membership_roles mr ON mr.membershipId = m.id INNER JOIN roles r ON r.id = mr.roleId WHERE m.tenantId = ${tenantId} AND m.userId = ${userId} AND m.status = 'active' AND r.tenantId = ${tenantId} AND r.code = 'TENANT_OWNER' AND mr.scopeType = 'company' LIMIT 1`);
  if (!rows.length) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_OWNER_REQUIRED" });
}

// ------------------------------------------------------------------------------------------------------------------ export

export type ExportLine = { kind: "manifest" | "table-start" | "row" | "table-end" | "summary"; [key: string]: unknown };

/** Every row the company owns, as lines: a manifest, then for each table its rows, then a summary with counts per table. */
export async function* exportTenantLines(db: Db, tenantId: string, options: { signedUrl?: (key: string) => Promise<string | null>; now?: Date } = {}): AsyncGenerator<ExportLine> {
  const map = await readSchemaMap(db);
  assertSchemaClassified(map);
  const company = (await q(db, sql`SELECT id, legalName, slug, status, defaultLocale, createdAt FROM companies WHERE id = ${tenantId}`))[0];
  if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_TENANT_NOT_FOUND" });
  const tableNames = [...TENANT_CHILD_TABLES.map(child => child.table), ...map.tenantTables].sort();
  yield { kind: "manifest", format: "project-os-tenant-export/1", exportedAt: (options.now ?? new Date()).toISOString(), company, tables: tableNames, redactedColumns: REDACTED_COLUMNS, note: "A row is one line. Stored files are listed with their object keys; a time-limited download link is included for each when the storage service is configured." };

  const counts: Record<string, number> = {};
  for (const table of tableNames) {
    const child = childFor(table);
    const keys = map.primaryKeys[table] ?? [];
    const order = (keys.length ? keys : [map.columns[table][0]]).map(key => `${child ? "c." : ""}\`${key}\``).join(", ");
    const redacted = new Set(REDACTED_COLUMNS[table] ?? []);
    yield { kind: "table-start", table };
    counts[table] = 0;
    // One-column keys page by "after the last key seen" (a deep OFFSET is re-read from the start on every page, which made a 130,000-row
    // company take 61 s to export on TiDB instead of 3 s); the single table with a composite key (role_permissions) is small and uses OFFSET.
    const keyset = keys.length === 1;
    let last: unknown = null;
    for (let offset = 0; ; offset += PAGE) {
      const after = keyset && last !== null ? sql` AND ${sql.raw(child ? "c." : "")}${id(keys[0])} > ${last}` : sql``;
      const skip = keyset ? sql`` : sql` OFFSET ${sql.raw(String(offset))}`;
      const rows = await q<Record<string, unknown>>(db, child
        ? sql`SELECT c.* FROM ${id(table)} c INNER JOIN ${id(child.parent)} p ON c.${id(child.column)} = p.id WHERE p.tenantId = ${tenantId}${after} ORDER BY ${sql.raw(order)} LIMIT ${sql.raw(String(PAGE))}${skip}`
        : sql`SELECT * FROM ${id(table)} WHERE tenantId = ${tenantId}${after} ORDER BY ${sql.raw(order)} LIMIT ${sql.raw(String(PAGE))}${skip}`);
      if (keyset && rows.length) last = rows[rows.length - 1][keys[0]];
      for (const row of rows) {
        redacted.forEach(column => { delete row[column]; });
        const file = FILE_TABLES.find(item => item.table === table);
        if (file && options.signedUrl && typeof row[file.column] === "string") row.downloadUrl = await options.signedUrl(String(row[file.column])).catch(() => null);
        counts[table]++;
        yield { kind: "row", table, row };
      }
      if (rows.length < PAGE) break;
    }
    yield { kind: "table-end", table, rows: counts[table] };
  }
  // people who belong to the company: name and address only (never the sign-in identity)
  const people = await q(db, sql`SELECT u.id, u.name, u.email, u.lastSignedIn FROM users u INNER JOIN memberships m ON m.userId = u.id WHERE m.tenantId = ${tenantId} ORDER BY u.id`);
  yield { kind: "table-start", table: "users" };
  for (const person of people) yield { kind: "row", table: "users", row: person };
  yield { kind: "table-end", table: "users", rows: people.length };
  counts.users = people.length;
  yield { kind: "summary", counts, totalRows: Object.values(counts).reduce((sum, value) => sum + value, 0) };
}

// ------------------------------------------------------------------------------------------------------------------ confirmation

export type DeletionTokenPayload = { v: 1; tenantId: string; userId: number; exp: number; nonce: string; rows: number };

const sign = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function issueDeletionToken(input: { secret: string; tenantId: string; userId: number; totalRows: number; now?: Date }): { token: string; expiresAt: Date } {
  if (!input.secret) throw new Error("A signing secret is required");
  const expiresAt = new Date((input.now ?? new Date()).getTime() + DELETION_TOKEN_TTL_MS);
  const payload: DeletionTokenPayload = { v: 1, tenantId: input.tenantId, userId: input.userId, exp: expiresAt.getTime(), nonce: randomUUID(), rows: input.totalRows };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${body}.${sign(input.secret, body)}`, expiresAt };
}

/** The token proves a request was made, by this person, for this company, a few minutes ago. It carries no authority by itself. */
export function verifyDeletionToken(input: { secret: string; token: string; tenantId: string; userId: number; now?: Date }): DeletionTokenPayload {
  const refuse = (): never => { throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_DELETION_CONFIRMATION_INVALID" }); };
  const [body, signature] = input.token.split(".");
  if (!body || !signature || !input.secret) return refuse();
  const expected = Buffer.from(sign(input.secret, body)); const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return refuse();
  let payload: DeletionTokenPayload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return refuse(); }
  if (payload.v !== 1 || payload.tenantId !== input.tenantId || payload.userId !== input.userId) return refuse();
  if (payload.exp < (input.now ?? new Date()).getTime()) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_DELETION_CONFIRMATION_EXPIRED" });
  return payload;
}

// ------------------------------------------------------------------------------------------------------------------ erasure

export type DeletionReport = {
  tenantId: string;
  verification: "PASS" | "FAIL";
  startedAt: string;
  finishedAt: string;
  /** how many times the erasure had to run before a recount found nothing (1 = at once; more = a request that began before the freeze was still writing) */
  passes: number;
  tablesChecked: number;
  rowsBefore: number;
  rowsDeleted: number;
  remaining: Array<{ table: string; rows: number }>;
  perTable: Array<{ table: string; before: number; deleted: number; after: number }>;
  retained: { auditRows: number; companyRow: "tombstone" };
  people: { scrubbed: number; keptBecauseInAnotherCompany: number };
  files: { found: number; deleted: number; failed: number; failedKeys: string[] };
};


const MAX_ERASE_PASSES = 4;
const DRAIN_MS = 300;
/** A freeze younger than this, with no erasure recorded after it, means another run is working on the company. */
const IN_PROGRESS_WINDOW_MS = 5 * 60 * 1000;

async function collectObjectKeys(db: Db, tenantId: string): Promise<string[]> {
  const keys: string[] = [];
  for (const file of FILE_TABLES) for (const row of await q<{ k: string }>(db, sql`SELECT ${id(file.column)} AS k FROM ${id(file.table)} WHERE tenantId = ${tenantId} AND ${id(file.column)} IS NOT NULL`)) keys.push(row.k);
  return keys;
}

/**
 * Freezes the company in one transaction: its row is locked (so two simultaneous erasures cannot both proceed — the second waits for this commit
 * and then finds the freeze), its products are switched off (every access check requires a licensed product, so every request that starts after
 * this commit is refused), its status becomes suspended, and the freeze is written to the audit trail. A company already erased is left as it is.
 */
export async function freezeTenant(db: Db, tenantId: string, actorUserId: number, now: () => Date = () => new Date()) {
  await db.transaction(async tx => {
    const rows = (await tx.execute(sql`SELECT status FROM companies WHERE id = ${tenantId} FOR UPDATE`)) as unknown as [Array<{ status: string }>, unknown];
    const company = rows[0][0];
    if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_TENANT_NOT_FOUND" });
    if (company.status === "archived") return; // already erased: finishing it again is allowed and harmless
    const recent = (await tx.execute(sql`SELECT createdAt AS at FROM audit_logs WHERE tenantId = ${tenantId} AND action = 'tenant.deletion_frozen' ORDER BY createdAt DESC LIMIT 1`)) as unknown as [Array<{ at: Date | string }>, unknown];
    if (recent[0][0] && now().getTime() - new Date(recent[0][0].at).getTime() < IN_PROGRESS_WINDOW_MS) {
      const finished = (await tx.execute(sql`SELECT 1 AS ok FROM audit_logs WHERE tenantId = ${tenantId} AND action = 'tenant.data_deleted' AND createdAt >= ${new Date(recent[0][0].at)} LIMIT 1`)) as unknown as [unknown[], unknown];
      if (!finished[0].length) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_DELETION_IN_PROGRESS" });
    }
    await tx.execute(sql`UPDATE tenant_entitlements SET active = false WHERE tenantId = ${tenantId}`);
    await tx.execute(sql`UPDATE companies SET status = 'suspended' WHERE id = ${tenantId} AND status = 'active'`);
    await tx.execute(sql`INSERT INTO audit_logs (id, tenantId, actorUserId, action, entityType, entityId, metadata) VALUES (${randomUUID()}, ${tenantId}, ${actorUserId}, 'tenant.deletion_frozen', 'company', ${tenantId}, ${JSON.stringify({ at: now().toISOString() })})`);
  });
}

/** One sweep over everything the company owns: its child tables, then its tables in foreign-key order, in batches. */
async function erasePass(db: Db, tenantId: string, map: SchemaMap, deleted: Map<string, number>) {
  const batch = sql.raw(String(DELETE_BATCH));
  for (const child of TENANT_CHILD_TABLES) {
    if (IDENTITY_TABLES.includes(child.table)) continue;
    let total = 0;
    for (;;) {
      const n = await affected(db, sql`DELETE c FROM ${id(child.table)} c INNER JOIN ${id(child.parent)} p ON c.${id(child.column)} = p.id WHERE p.tenantId = ${tenantId}`);
      total += n; if (!n) break;
    }
    deleted.set(child.table, (deleted.get(child.table) ?? 0) + total);
  }
  for (const table of map.deletionOrder) {
    const child = childFor(table);
    let total = 0;
    for (;;) {
      const n = child
        ? await affected(db, sql`DELETE c FROM ${id(table)} c INNER JOIN ${id(child.parent)} p ON c.${id(child.column)} = p.id WHERE p.tenantId = ${tenantId}`)
        : await affected(db, sql`DELETE FROM ${id(table)} WHERE tenantId = ${tenantId} LIMIT ${batch}`);
      total += n; if (!n || child) break;
    }
    deleted.set(table, (deleted.get(table) ?? 0) + total);
  }
}

/**
 * Erases everything the company owns. The caller has already checked the owner, the fresh export, the token and the typed name.
 * Order: freeze the company (its products are switched off, so no request can write any more) → read what exists → delete in
 * foreign-key order in batches → scrub people → tombstone the company → delete stored files → count again → record it.
 * It can be run again until it reports PASS: every step is a delete or an update that tolerates having been done.
 */
export async function deleteTenantData(input: { db: Db; tenantId: string; actorUserId: number; storageDelete?: (key: string) => Promise<void>; now?: () => Date; /** test seams: called right after the freeze commits and after each erasure pass */ observe?: { afterFreeze?: () => Promise<void>; afterErase?: (pass: number) => Promise<void> } }): Promise<DeletionReport> {
  const { db, tenantId } = input;
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const map = await readSchemaMap(db);
  assertSchemaClassified(map);

  // 1. freeze, in ONE transaction, before anything about the company's data is read (the schema check above reads the catalogue, not the company)
  await freezeTenant(db, tenantId, input.actorUserId, now);
  await input.observe?.afterFreeze?.();

  // 2. read what exists
  const before = await countTenantData(db, tenantId, map);
  const objectKeys = new Set<string>(await collectObjectKeys(db, tenantId));
  const onlyHere = await personIdsOnlyIn(db, tenantId);
  const everyone = (await q<{ userId: number }>(db, sql`SELECT userId FROM memberships WHERE tenantId = ${tenantId}`)).map(row => Number(row.userId));

  // 3. erase, children first; and repeat until a count taken afterwards is zero. The freeze stops every request that starts after it, but one that
  //    passed its access check a moment BEFORE it may still be writing; it is caught here by the next pass (and, failing that, by the final count).
  const deleted = new Map<string, number>();
  let passes = 0;
  while (passes < MAX_ERASE_PASSES) {
    passes++;
    await erasePass(db, tenantId, map, deleted);
    await input.observe?.afterErase?.(passes);
    if ((await countTenantData(db, tenantId, map)).totalRows === 0) break;
    for (const key of await collectObjectKeys(db, tenantId)) objectKeys.add(key);
    await new Promise(resolve => setTimeout(resolve, DRAIN_MS));
  }

  // 4. people: identity removed for those who belong to no other company; their sessions end
  if (onlyHere.length) {
    const ids = sql.join(onlyHere.map(userId => sql`${userId}`), sql`, `);
    await db.execute(sql`DELETE FROM auth_sessions WHERE userId IN (${ids})`);
    await db.execute(sql`DELETE FROM self_service_signup_attempts WHERE userId IN (${ids})`);
    await db.execute(sql`UPDATE users SET name = 'Deleted user', email = NULL, openId = CONCAT('deleted:', UUID()), loginMethod = NULL WHERE id IN (${ids})`);
  }

  // 5. the company row stays as a tombstone (audit rows point at it)
  await db.execute(sql`UPDATE companies SET status = 'archived', legalName = ${`Deleted company ${tenantId.slice(0, 8)}`}, slug = ${`deleted-${tenantId}`} WHERE id = ${tenantId}`);

  // 6. stored files (after the rows: a failure here loses nothing the database still depends on; the keys are in the report)
  const keys = Array.from(objectKeys);
  const files = { found: keys.length, deleted: 0, failed: 0, failedKeys: [] as string[] };
  if (input.storageDelete) {
    for (const key of keys) {
      try { await input.storageDelete(key); files.deleted++; } catch { files.failed++; files.failedKeys.push(key); }
    }
  } else files.failed = keys.length, files.failedKeys.push(...keys);

  // 7. count again, table by table
  const after = await countTenantData(db, tenantId, map);
  const afterBy = new Map(after.tables.map(item => [item.table, item.rows]));
  const perTable = before.tables.map(item => ({ table: item.table, before: item.rows, deleted: deleted.get(item.table) ?? 0, after: afterBy.get(item.table) ?? 0 }));
  const remaining = after.tables.filter(item => item.rows > 0);
  const report: DeletionReport = {
    tenantId,
    verification: remaining.length === 0 && files.failed === 0 ? "PASS" : "FAIL",
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    passes,
    tablesChecked: after.tables.length,
    rowsBefore: before.totalRows,
    rowsDeleted: perTable.reduce((sum, item) => sum + item.deleted, 0),
    remaining,
    perTable,
    retained: { auditRows: after.auditRows, companyRow: "tombstone" },
    people: { scrubbed: onlyHere.length, keptBecauseInAnotherCompany: everyone.length - onlyHere.length },
    files,
  };
  // 8. the record of the erasure itself — appended to the audit trail, which is never deleted
  await db.execute(sql`INSERT INTO audit_logs (id, tenantId, actorUserId, action, entityType, entityId, metadata) VALUES (${randomUUID()}, ${tenantId}, ${input.actorUserId}, 'tenant.data_deleted', 'company', ${tenantId}, ${JSON.stringify({ ...report, perTable: report.perTable.filter(item => item.before > 0 || item.after > 0) })})`);
  return report;
}

/** True when this company was exported by someone in the last EXPORT_FRESH_DAYS days (read from the audit trail; no table of its own). */
export async function latestExportAt(db: Db, tenantId: string): Promise<Date | null> {
  const rows = await q<{ at: Date | string }>(db, sql`SELECT createdAt AS at FROM audit_logs WHERE tenantId = ${tenantId} AND action = 'tenant.data_exported' ORDER BY createdAt DESC LIMIT 1`);
  return rows[0] ? new Date(rows[0].at) : null;
}

export async function recordAudit(db: Db, input: { tenantId: string; actorUserId: number; action: string; metadata: unknown }) {
  await db.execute(sql`INSERT INTO audit_logs (id, tenantId, actorUserId, action, entityType, entityId, metadata) VALUES (${randomUUID()}, ${input.tenantId}, ${input.actorUserId}, ${input.action}, 'company', ${input.tenantId}, ${JSON.stringify(input.metadata)})`);
}
