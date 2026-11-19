// D-44 (b): the project's equipment list from a spreadsheet (type | count | model | plate or size), through the direct-upload import jobs (externalImports.ts):
// analysed in the background, confirmed in one transaction, the same file refused a second time (importJobs). Permission: project.manage (externalImports.gate).
//   - a row with a plate or size is ONE machine, keyed by that plate (any letter case): a second import updates its type and model, never adds it again;
//   - a row without one is a count of machines of that type and model: the import adds only what the project does not have yet (never removes), so importing the
//     same list again adds nothing;
//   - anything wrong (no type, a count that is not a whole number from 1 to 500, a count above 1 with a plate, a plate twice in the file) stops the whole file.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLogs, projectEquipment } from "../drizzle/schema";
import { getDb } from "./db";
import { readGrid, type Cell } from "./domain/smartImport/sheetReader";
import { normName } from "./domain/smartImport/tracker";

type Scope = { userId: number; tenantId: string; projectId: string };
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Error_ = { rowNumber: number; code: string; field?: string; detail?: string };
// the accepted header words, compared after the same normalisation as the cell
const ALIASES = Object.fromEntries(Object.entries({
  equipmentType: ["النوع", "نوع المعدة", "المعدة", "type", "equipment type", "equipment"],
  count: ["العدد", "الكمية", "count", "qty", "quantity", "no"],
  model: ["الطراز", "الموديل", "model"],
  plateOrSize: ["اللوحة أو المقاس", "اللوحة", "المقاس", "رقم اللوحة", "plate or size", "plate", "plate no", "size"],
}).map(([field, words]) => [field, words.map(normName)])) as Record<"equipmentType" | "count" | "model" | "plateOrSize", string[]>;
type Field = keyof typeof ALIASES;
const text = (cell: Cell | undefined) => (cell === null || cell === undefined ? "" : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell).trim());
const key = (type: string, model: string | null) => `${type.toLowerCase()}\u0000${(model ?? "").toLowerCase()}`;

export type EquipmentPlan = {
  totalRows: number; errors: Error_[];
  creates: Array<{ rowNumber: number; equipmentType: string; model: string | null; plateOrSize: string | null }>;
  updates: Array<{ rowNumber: number; id: string; equipmentType: string; model: string | null; plateOrSize: string }>;
  unchanged: number;
};

/** Which column of the file each field was read from (Q-31, P0-02), shown with the report so a person can choose another and analyse again. */
export type EquipmentColumns = { headers: string[]; fields: Array<{ key: Field; required: boolean; header: string | null }>; overridden: boolean };
export type EquipmentFile = { rows: Array<{ rowNumber: number; values: Record<Field, string> }>; columns?: EquipmentColumns; errors: Error_[] };
const FIELDS = Object.keys(ALIASES) as Field[];
const IGNORE_OTHER_COLUMNS = "__others__";

/**
 * Reads the first sheet whose header row (in its first 10 rows) names a type column; the other columns are optional and other columns are ignored.
 * `override` (field → the header as the file writes it; "" = no column) is a person's choice: the header row is then the first one that holds every chosen
 * header. A field the list does not have, a header no row holds, or one header for two fields is refused whole (IMPORT_MAPPING_INVALID). A file with no type
 * column is reported with its first row's columns and «type: missing», so the person can choose it — it is no longer a dead end.
 */
export async function readEquipmentRows(bytes: Uint8Array, format: "xlsx" | "csv", override?: Record<string, string>): Promise<EquipmentFile> {
  const grid = await readGrid(bytes, format);
  if (!grid.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  const choice = override && Object.keys(override).length ? Object.entries(override).filter(([field]) => field !== IGNORE_OTHER_COLUMNS) : undefined;
  const invalid = (name: string): EquipmentFile => ({ rows: [], errors: [{ rowNumber: 0, code: "IMPORT_MAPPING_INVALID", field: name }] });
  if (choice) {
    if (IGNORE_OTHER_COLUMNS in override! && override![IGNORE_OTHER_COLUMNS] !== "ignore") return invalid(IGNORE_OTHER_COLUMNS);
    const used = new Set<string>();
    for (const [field, header] of choice) {
      if (!FIELDS.includes(field as Field)) return invalid(field);
      if (header === "") continue;
      if (used.has(header)) return invalid(header);
      used.add(header);
    }
  }
  const wanted = choice ? choice.map(([, header]) => header).filter(Boolean) : [];
  let fallback: { sheet: (typeof grid.sheets)[number]; r: number } | null = null;
  for (const sheet of grid.sheets) for (let r = 0; r < Math.min(10, sheet.rows.length); r++) {
    const headers = sheet.rows[r].map(cell => text(cell));
    if (!fallback && headers.some(Boolean)) fallback = { sheet, r };
    if (choice && !wanted.every(header => headers.includes(header))) continue;
    const columns = new Map<Field, number>();
    headers.forEach((label, c) => { for (const field of FIELDS) if (!columns.has(field) && ALIASES[field].includes(normName(label))) columns.set(field, c); });
    if (choice) {
      const chosen = new Set(wanted.map(header => headers.indexOf(header)));
      for (const [field, column] of Array.from(columns)) if (chosen.has(column)) columns.delete(field);
      for (const [field, header] of choice) { columns.delete(field as Field); if (header !== "") columns.set(field as Field, headers.indexOf(header)); }
    } else if (!columns.has("equipmentType")) continue;
    return read(sheet.rows, r, headers, columns, Boolean(choice));
  }
  if (choice) return invalid(wanted.find(header => !grid.sheets.some(sheet => sheet.rows.slice(0, 10).some(row => row.map(cell => text(cell)).includes(header)))) ?? wanted[0] ?? "");
  if (!fallback) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_EQUIPMENT_IMPORT_NOT_RECOGNISED" });
  return read(fallback.sheet.rows, fallback.r, fallback.sheet.rows[fallback.r].map(cell => text(cell)), new Map(), false);
}

function read(sheetRows: Cell[][], r: number, headers: string[], columns: Map<Field, number>, overridden: boolean): EquipmentFile {
  const report: EquipmentColumns = { headers: headers.filter(Boolean), fields: FIELDS.map(field => ({ key: field, required: field === "equipmentType", header: columns.has(field) ? headers[columns.get(field)!] : null })), overridden };
  if (!columns.has("equipmentType")) return { rows: [], columns: report, errors: [{ rowNumber: 0, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: "equipmentType" }] };
  const rows = sheetRows.slice(r + 1).map((row, i) => ({ rowNumber: r + i + 2, values: Object.fromEntries(FIELDS.map(field => [field, columns.has(field) ? text(row[columns.get(field)!]) : ""])) as Record<Field, string> }))
    .filter(row => Object.values(row.values).some(Boolean));
  return { rows, columns: report, errors: [] };
}

export async function planEquipmentImport(db: Db, input: Scope, rows: EquipmentFile["rows"]): Promise<EquipmentPlan> {
  const existing = await db.select({ id: projectEquipment.id, equipmentType: projectEquipment.equipmentType, model: projectEquipment.model, plateOrSize: projectEquipment.plateOrSize, active: projectEquipment.active })
    .from(projectEquipment).where(and(eq(projectEquipment.tenantId, input.tenantId), eq(projectEquipment.projectId, input.projectId)));
  const byPlate = new Map(existing.flatMap(item => (item.plateOrSize ? [[item.plateOrSize.toLowerCase(), item] as const] : [])));
  const have = new Map<string, number>();
  for (const item of existing) if (!item.plateOrSize && item.active) have.set(key(item.equipmentType, item.model), (have.get(key(item.equipmentType, item.model)) ?? 0) + 1);
  const plan: EquipmentPlan = { totalRows: rows.length, errors: [], creates: [], updates: [], unchanged: 0 };
  const plates = new Set<string>(); const wanted = new Map<string, { rowNumber: number; equipmentType: string; model: string | null; count: number }>();
  for (const { rowNumber, values } of rows) {
    const before = plan.errors.length;
    const equipmentType = values.equipmentType.slice(0, 120); const model = values.model.slice(0, 120) || null; const plate = values.plateOrSize.slice(0, 80) || null;
    const count = values.count === "" ? 1 : Number(values.count);
    if (!equipmentType) plan.errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "equipmentType" });
    if (!Number.isInteger(count) || count < 1 || count > 500) plan.errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "count", detail: values.count });
    else if (plate && count > 1) plan.errors.push({ rowNumber, code: "EQUIPMENT_COUNT_WITH_PLATE", field: "count", detail: plate });
    if (plate && plates.has(plate.toLowerCase())) plan.errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "plateOrSize", detail: plate });
    if (plan.errors.length > before) continue;
    if (plate) {
      plates.add(plate.toLowerCase());
      const stored = byPlate.get(plate.toLowerCase());
      if (!stored) plan.creates.push({ rowNumber, equipmentType, model, plateOrSize: plate });
      else if (stored.equipmentType === equipmentType && stored.model === model) plan.unchanged += 1;
      else plan.updates.push({ rowNumber, id: stored.id, equipmentType, model, plateOrSize: stored.plateOrSize! });
    } else {
      const k = key(equipmentType, model); const sum = wanted.get(k);
      wanted.set(k, { rowNumber: sum?.rowNumber ?? rowNumber, equipmentType, model, count: (sum?.count ?? 0) + count });
    }
  }
  for (const [k, item] of Array.from(wanted)) {
    const missing = Math.max(0, item.count - (have.get(k) ?? 0));
    for (let n = 0; n < missing; n++) plan.creates.push({ rowNumber: item.rowNumber, equipmentType: item.equipmentType, model: item.model, plateOrSize: null });
    plan.unchanged += item.count - missing;
  }
  return plan;
}

/** The write, planned again against the project as it is now, in one transaction with its audit row. */
export async function applyEquipmentImport(db: Db, input: Scope & { importId: string }, rows: EquipmentFile["rows"]) {
  return db.transaction(async tx => {
    const plan = await planEquipmentImport(tx as unknown as Db, input, rows);
    if (plan.errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_VALIDATION_FAILED" });
    if (!plan.creates.length && !plan.updates.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_NOTHING_TO_CONFIRM" });
    const results: Array<{ rowNumber: number; key: string; action: "created" | "updated"; entityId: string }> = [];
    const created = plan.creates.map(item => ({ ...item, id: randomUUID() }));
    if (created.length) await tx.insert(projectEquipment).values(created.map(item => ({ id: item.id, tenantId: input.tenantId, projectId: input.projectId, equipmentType: item.equipmentType, model: item.model, plateOrSize: item.plateOrSize })));
    // one result per file row (an unplated row of N machines names the first of them and its count)
    for (const item of created) {
      const same = created.filter(other => other.rowNumber === item.rowNumber);
      if (same[0] === item) results.push({ rowNumber: item.rowNumber, key: item.plateOrSize ?? `${item.equipmentType} x${same.length}`, action: "created", entityId: item.id });
    }
    for (const item of plan.updates) {
      const updated = await tx.update(projectEquipment).set({ equipmentType: item.equipmentType, model: item.model, updatedAt: new Date() }).where(and(eq(projectEquipment.id, item.id), eq(projectEquipment.tenantId, input.tenantId), eq(projectEquipment.projectId, input.projectId))).returning({ id: projectEquipment.id });
      if (updated.length !== 1) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_VERSION_CONFLICT" });
      results.push({ rowNumber: item.rowNumber, key: item.plateOrSize, action: "updated", entityId: item.id });
    }
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.equipment_imported", entityType: "data_import", entityId: input.importId, metadata: JSON.stringify({ projectId: input.projectId, created: created.length, updated: plan.updates.length, unchanged: plan.unchanged }) });
    return { createdRows: created.length, updatedRows: plan.updates.length, skippedRows: plan.unchanged, results };
  });
}
