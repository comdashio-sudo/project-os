// Work order 22: the consultant's weekly export → the consultant's state of each cell (received or not), and nothing else: the site's state and the monthly report are never touched.
//   analyze  the same steps in a transaction that is rolled back: what is new this week («N items received since the last export»), what went back, the villas the platform does
//            not know, and the columns not yet linked to the catalogue (by WIR automatically; the rest are the owner's to match once);
//   confirm  the same steps, committed in one transaction with the import record, the original file link and the audit row. The same file twice is refused.
// A column is linked to a catalogue activity by its WIR number when the monthly report carries the same number; a different number stays unlinked until the owner matches it,
// and the match is kept for every later export (pmc_consultant_columns.activity_code, link_method «owner»).
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLogs, dataImportSources, dataImports, pmcActivityDefinitions, pmcConsultantCellEvents, pmcConsultantCells, pmcConsultantColumns } from "../drizzle/schema";
import { isDuplicateEntryError } from "./db";
import { detectConsultantExport, wirNumber, type ConsultantModel } from "./domain/smartImport/consultantExport";
import { readGrid } from "./domain/smartImport/sheetReader";
import { nameScore } from "./domain/pmcActivityMatch";
import { assertNotImportedYet, chunks, pmcGate, siteToday, unitsByVilla, villaKey, type Db, type Scope } from "./wo22Shared";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type ConsultantPlan = {
  fileHash: string; exportDate: string | null; observedOn: string; project: string | null;
  units: number; columns: number; newColumns: number;
  /** columns linked now by their WIR number (the same number in the monthly report) */
  linkedByWir: number;
  /** columns no WIR in the monthly report matches: the owner matches each once (a suggestion by name is offered) */
  unlinked: Array<{ key: string; wir: string | null; activity: string; location: string; section: string; suggestions: Array<{ activityCode: string; name: string; wir: string | null; score: number }> }>;
  /** what this export changes: received since the last export, no longer received, unchanged */
  newlyReceived: number; noLongerReceived: number; unchanged: number; receivedTotal: number;
  unknownVillas: Array<{ row: number; villa: string }>;
  /** the export's own percentage beside each WIR, compared with what its cells say */
  reportedMismatches: number;
  warnings: string[];
  canConfirm: boolean;
};

class Rollback extends Error { constructor(readonly plan: ConsultantPlan) { super("rollback"); } }

export async function readConsultantExport(bytes: Uint8Array): Promise<{ model: ConsultantModel; fileHash: string }> {
  const grid = await readGrid(bytes, "xlsx");
  if (!grid.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  for (const sheet of grid.sheets) { const detected = detectConsultantExport(sheet); if (detected.ok) return { model: detected.model, fileHash: createHash("sha256").update(bytes).digest("hex") }; }
  throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_CONSULTANT_EXPORT_NOT_RECOGNISED" });
}

async function run(tx: Tx, input: Scope, model: ConsultantModel, fileHash: string, source: { key: string; name: string } | null, commit: boolean): Promise<ConsultantPlan & { importId?: string }> {
  const observedOn = model.exportDate ?? siteToday();
  const plan: ConsultantPlan = { fileHash, exportDate: model.exportDate, observedOn, project: model.project, units: 0, columns: model.columns.length, newColumns: 0, linkedByWir: 0, unlinked: [], newlyReceived: 0, noLongerReceived: 0, unchanged: 0, receivedTotal: 0, unknownVillas: [], reportedMismatches: 0, warnings: [...model.warnings], canConfirm: false };
  const { byVilla } = await unitsByVilla(tx, input);
  if (byVilla.size === 0) { plan.warnings.push("CONSULTANT_NO_UNITS_IN_PROJECT"); throw new Rollback(plan); } // import the monthly report first: it builds the villas

  // 1. the columns: kept by their key from one export to the next; a new one is linked by its WIR when the catalogue has that number
  const catalog = await tx.select({ code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, wirCode: pmcActivityDefinitions.wirCode }).from(pmcActivityDefinitions).where(and(eq(pmcActivityDefinitions.tenantId, input.tenantId), eq(pmcActivityDefinitions.projectId, input.projectId)));
  const byCode = new Map<string, { code: string; name: string; wirCode: string | null }>(); for (const item of catalog) if (!byCode.has(item.code)) byCode.set(item.code, item);
  const byWir = new Map<string, string[]>();
  byCode.forEach(item => { const n = wirNumber(item.wirCode); if (n) byWir.set(n, Array.from(new Set([...(byWir.get(n) ?? []), item.code]))); });
  const existing = await tx.select().from(pmcConsultantColumns).where(and(eq(pmcConsultantColumns.tenantId, input.tenantId), eq(pmcConsultantColumns.projectId, input.projectId)));
  const existingByKey = new Map(existing.map(column => [column.sourceKey, column]));
  const columnId: string[] = []; const now = new Date();
  for (const column of model.columns) {
    const stored = existingByKey.get(column.key);
    const wirMatches = byWir.get(wirNumber(column.wir) ?? "") ?? [];
    const autoCode = wirMatches.length === 1 ? wirMatches[0] : null;
    const fields = { wirCode: column.wir?.slice(0, 40) ?? null, sectionName: column.section.slice(0, 255) || null, subgroupName: column.subgroup.slice(0, 255) || null, activityName: column.activity.slice(0, 255), locationName: column.location.slice(0, 120) || null, weight: column.sectionWeight === null ? null : String(column.subgroupWeight ?? column.sectionWeight), reportedPercent: column.reportedPercent === null ? null : String(Math.round(column.reportedPercent * 1e6) / 1e6), sortOrder: column.index, updatedAt: now };
    if (stored) {
      const link = stored.activityCode ? {} : autoCode ? { activityCode: autoCode, linkMethod: "wir", linkedAt: now } : {};
      if (!stored.activityCode && autoCode) plan.linkedByWir += 1;
      const updated = await tx.update(pmcConsultantColumns).set({ ...fields, ...link }).where(and(eq(pmcConsultantColumns.id, stored.id), eq(pmcConsultantColumns.tenantId, input.tenantId))).returning({ id: pmcConsultantColumns.id, activityCode: pmcConsultantColumns.activityCode });
      if (updated.length !== 1) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_VALIDATION_FAILED" });
      columnId.push(stored.id);
      if (!updated[0].activityCode) plan.unlinked.push({ key: column.key, wir: column.wir, activity: column.activity, location: column.location, section: column.section, suggestions: [] });
    } else {
      const id = randomUUID(); plan.newColumns += 1;
      if (autoCode) plan.linkedByWir += 1;
      await tx.insert(pmcConsultantColumns).values({ id, tenantId: input.tenantId, projectId: input.projectId, sourceKey: column.key, ...fields, ...(autoCode ? { activityCode: autoCode, linkMethod: "wir", linkedAt: now } : {}) });
      columnId.push(id);
      if (!autoCode) plan.unlinked.push({ key: column.key, wir: column.wir, activity: column.activity, location: column.location, section: column.section, suggestions: [] });
    }
  }
  // a suggestion by name for each unlinked column (the owner decides; nothing is linked by a guess)
  const catalogList = Array.from(byCode.values());
  for (const item of plan.unlinked) {
    const label = `${item.activity}${item.location && !/whole building/i.test(item.location) ? ` - ${item.location}` : ""}`;
    const location = item.location.toLowerCase();
    item.suggestions = catalogList.map(entry => ({ activityCode: entry.code, name: entry.name, wir: entry.wirCode, score: Math.round(Math.min(1, nameScore(label, entry.name) * 0.95 + (location && !/whole building/.test(location) && entry.name.toLowerCase().includes(location) ? 0.05 : 0)) * 1e4) / 1e4 })).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  }

  // 2. the cells: received or not, per known villa; a change leaves an event dated with the export
  const knownUnits: Array<{ unitId: string; unit: (typeof model.units)[number] }> = [];
  for (const unit of model.units) { const hit = byVilla.get(villaKey(unit.unit)); if (hit) knownUnits.push({ unitId: hit.id, unit }); else plan.unknownVillas.push({ row: unit.row, villa: unit.unit }); }
  plan.units = knownUnits.length;
  const held = new Map<string, { id: string; status: string; firstReceivedOn: string | null }>();
  for (const batch of chunks(knownUnits.map(item => item.unitId), 200)) {
    const rows = await tx.select({ id: pmcConsultantCells.id, unitId: pmcConsultantCells.unitId, columnId: pmcConsultantCells.columnId, status: pmcConsultantCells.status, firstReceivedOn: pmcConsultantCells.firstReceivedOn }).from(pmcConsultantCells).where(and(eq(pmcConsultantCells.tenantId, input.tenantId), inArray(pmcConsultantCells.unitId, batch)));
    for (const row of rows) held.set(`${row.unitId}|${row.columnId}`, row);
  }
  const inserts: Array<typeof pmcConsultantCells.$inferInsert> = []; const updates: Array<{ id: string; status: "RECEIVED" | "NOT_RECEIVED"; firstReceivedOn: string | null }> = [];
  const events: Array<{ cellId: string; from: string | null; to: "RECEIVED" | "NOT_RECEIVED" }> = [];
  for (const { unitId, unit } of knownUnits) unit.received.forEach((received, c) => {
    const status = received ? "RECEIVED" as const : "NOT_RECEIVED" as const;
    if (received) plan.receivedTotal += 1;
    const current = held.get(`${unitId}|${columnId[c]}`);
    if (!current) {
      const id = randomUUID();
      inserts.push({ id, tenantId: input.tenantId, projectId: input.projectId, unitId, columnId: columnId[c], status, firstReceivedOn: received ? observedOn : null, statusOn: observedOn });
      if (received) { plan.newlyReceived += 1; events.push({ cellId: id, from: null, to: status }); } else plan.unchanged += 1;
      return;
    }
    const wasReceived = current.status !== "NOT_RECEIVED";
    if (wasReceived === received) { plan.unchanged += 1; return; }
    // the platform only knows received / not from this export; a richer status (approved, A/B/C) set later is not overwritten by «Ok»
    if (received) plan.newlyReceived += 1; else plan.noLongerReceived += 1;
    updates.push({ id: current.id, status, firstReceivedOn: received ? current.firstReceivedOn ?? observedOn : current.firstReceivedOn });
    events.push({ cellId: current.id, from: current.status, to: status });
  });
  // the export's own percentage beside each WIR, against its cells (said, never written)
  model.columns.forEach((column, c) => {
    if (column.reportedPercent === null || !model.units.length) return;
    const share = model.units.filter(unit => unit.received[c]).length / model.units.length;
    if (Math.abs(share - column.reportedPercent) > 0.0001) plan.reportedMismatches += 1;
  });
  if (plan.unknownVillas.length) plan.warnings.push("CONSULTANT_UNKNOWN_VILLAS");
  if (plan.unlinked.length) plan.warnings.push("CONSULTANT_COLUMNS_TO_MATCH");

  for (const batch of chunks(inserts, 1000)) await tx.insert(pmcConsultantCells).values(batch);
  for (const batch of chunks(updates, 100)) await Promise.all(batch.map(update => tx.update(pmcConsultantCells).set({ status: update.status, firstReceivedOn: update.firstReceivedOn, statusOn: observedOn, updatedAt: now }).where(and(eq(pmcConsultantCells.id, update.id), eq(pmcConsultantCells.tenantId, input.tenantId))).returning({ id: pmcConsultantCells.id }).then(rows => { if (rows.length !== 1) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_VALIDATION_FAILED" }); })));
  plan.canConfirm = plan.units > 0;
  if (!commit || !source) throw new Rollback(plan);

  const importId = randomUUID();
  for (const batch of chunks(events, 1000)) await tx.insert(pmcConsultantCellEvents).values(batch.map(event => ({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, cellId: event.cellId, fromStatus: event.from as never, toStatus: event.to, observedOn, importId })));
  if (updates.length || inserts.length) for (const batch of chunks(knownUnits.map(item => item.unitId), 300)) await tx.update(pmcConsultantCells).set({ lastImportId: importId }).where(and(eq(pmcConsultantCells.tenantId, input.tenantId), inArray(pmcConsultantCells.unitId, batch)));
  await tx.insert(dataImports).values({
    id: importId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "pmcConsultant", templateCode: "pmcConsultant_v1", sourceFormat: "xlsx", fileName: source.name, fileKey: source.key, fileHash, status: "completed",
    totalRows: model.units.length, validRows: plan.units, invalidRows: plan.unknownVillas.length, createdRows: inserts.length, updatedRows: updates.length, skippedRows: plan.unchanged,
    summaryJson: JSON.stringify({ consultant: { exportDate: model.exportDate, newlyReceived: plan.newlyReceived, noLongerReceived: plan.noLongerReceived, linkedByWir: plan.linkedByWir, unlinked: plan.unlinked.length, unknownVillas: plan.unknownVillas.length } }),
    createdByUserId: input.userId, progressPercent: 100, completedAt: now,
  });
  await tx.insert(dataImportSources).values({ importId, tenantId: input.tenantId, projectId: input.projectId, sourceKey: source.key, sourceName: source.name, detectedKind: "consultantExport", sheetName: model.sheet, mappingJson: JSON.stringify({ headerRow: model.headerRow, columns: model.columns.length }), mergedCellsFilled: 0 });
  await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.consultant_export_imported", entityType: "data_import", entityId: importId, metadata: JSON.stringify({ projectId: input.projectId, fileHash, exportDate: model.exportDate, newlyReceived: plan.newlyReceived, noLongerReceived: plan.noLongerReceived, linkedByWir: plan.linkedByWir }) });
  return { ...plan, importId };
}

async function inTransaction(input: Scope, model: ConsultantModel, fileHash: string, source: { key: string; name: string } | null, commit: boolean) {
  const db = await pmcGate(input, "project.pmc.manage");
  try { return await db.transaction(tx => run(tx, input, model, fileHash, source, commit)); }
  catch (error) { if (error instanceof Rollback) return error.plan; if (isDuplicateEntryError(error)) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_DUPLICATE_DETECTED" }); throw error; }
}

export async function analyzeConsultantImport(input: Scope & { bytes: Uint8Array }): Promise<ConsultantPlan> {
  const { model, fileHash } = await readConsultantExport(input.bytes);
  return inTransaction(input, model, fileHash, null, false);
}

export async function confirmConsultantImport(input: Scope & { bytes: Uint8Array; approvedHash?: string; source: { key: string; name: string } }): Promise<ConsultantPlan & { importId?: string }> {
  const { model, fileHash } = await readConsultantExport(input.bytes);
  if (input.approvedHash && input.approvedHash !== fileHash) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_IMPORT_FILE_CHANGED" });
  const db = await pmcGate(input, "project.pmc.manage");
  await assertNotImportedYet(db, { tenantId: input.tenantId, fileHash });
  const plan = await inTransaction(input, model, fileHash, input.source, true);
  if (!plan.canConfirm || !(plan as { importId?: string }).importId) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_VALIDATION_FAILED", cause: plan.warnings });
  return plan;
}

// ------------------------------------------------------------------ the owner's one-time match of a column the WIR could not link

export async function listConsultantColumns(input: Scope) {
  const db = await pmcGate(input, "project.pmc.read");
  return db.select({ id: pmcConsultantColumns.id, sourceKey: pmcConsultantColumns.sourceKey, wirCode: pmcConsultantColumns.wirCode, sectionName: pmcConsultantColumns.sectionName, activityName: pmcConsultantColumns.activityName, locationName: pmcConsultantColumns.locationName, activityCode: pmcConsultantColumns.activityCode, linkMethod: pmcConsultantColumns.linkMethod, sortOrder: pmcConsultantColumns.sortOrder })
    .from(pmcConsultantColumns).where(and(eq(pmcConsultantColumns.tenantId, input.tenantId), eq(pmcConsultantColumns.projectId, input.projectId))).orderBy(pmcConsultantColumns.sortOrder);
}

export async function linkConsultantColumns(input: Scope & { links: Array<{ columnId: string; activityCode: string | null }> }) {
  const db = await pmcGate(input, "project.pmc.manage");
  const codes = Array.from(new Set(input.links.map(link => link.activityCode).filter((code): code is string => Boolean(code))));
  if (codes.length) {
    const known = new Set((await db.select({ code: pmcActivityDefinitions.code }).from(pmcActivityDefinitions).where(and(eq(pmcActivityDefinitions.tenantId, input.tenantId), eq(pmcActivityDefinitions.projectId, input.projectId), inArray(pmcActivityDefinitions.code, codes)))).map(row => row.code));
    if (codes.some(code => !known.has(code))) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_ACTIVITY_NOT_FOUND" });
  }
  const now = new Date();
  await db.transaction(async tx => {
    for (const link of input.links) {
      const updated = await tx.update(pmcConsultantColumns).set(link.activityCode ? { activityCode: link.activityCode, linkMethod: "owner", linkedByUserId: input.userId, linkedAt: now, updatedAt: now } : { activityCode: null, linkMethod: null, linkedByUserId: null, linkedAt: null, updatedAt: now })
        .where(and(eq(pmcConsultantColumns.id, link.columnId), eq(pmcConsultantColumns.tenantId, input.tenantId), eq(pmcConsultantColumns.projectId, input.projectId))).returning({ id: pmcConsultantColumns.id });
      if (updated.length !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PMC_ACTIVITY_NOT_FOUND" });
    }
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.consultant_columns_linked", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ links: input.links.length }) });
  });
  return { linked: input.links.filter(link => link.activityCode).length, unlinked: input.links.filter(link => !link.activityCode).length };
}
