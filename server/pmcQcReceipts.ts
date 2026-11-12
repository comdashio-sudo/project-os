// Q-5: the QC engineer's «received / not received» for one activity on several villas (a list, a range or a block) and a date, saved once. It is kept apart from
// the site's progress (pmc_qc_receipts beside pmc_unit_activity_progress), so a villa's card shows both. The same checks as the site engineer's update
// (resolveVillaBatch: refused whole, villa by villa, before anything is written); the permission is project.qc.receive, which only the QA/QC role holds.
// Every change is an event (from, to, the date chosen, who, when) and one audit row, in the same transaction. A villa not yet complete on site for that
// activity is still saved but named in `warnings` (the owner's tool warns the same way).
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auditLogs, pmcActivityDefinitions, pmcBlocks, pmcQcReceiptEvents, pmcQcReceipts, pmcUnitActivityProgress, pmcUnits, users } from "../drizzle/schema";
import { authorize, mine, type Scope } from "./pmcService";
import { resolveVillaBatch } from "./pmcProgressUpdate";
import { villaKey } from "./wo22Shared";

export type QcReceiptInput = Scope & { activityCode: string; villas?: string[]; range?: string; blockCode?: string; received: boolean; date: string };

export async function updatePmcQcReceipts(input: QcReceiptInput) {
  const db = await authorize(input, "project.qc.receive");
  const targets = await resolveVillaBatch(db, input);
  const unitIds = targets.map(target => target.unitId);
  const now = new Date();
  return db.transaction(async tx => {
    const existing = await tx.select({ id: pmcQcReceipts.id, unitId: pmcQcReceipts.unitId, activityDefinitionId: pmcQcReceipts.activityDefinitionId, received: pmcQcReceipts.received, receivedOn: pmcQcReceipts.receivedOn })
      .from(pmcQcReceipts).where(and(mine(pmcQcReceipts, input), inArray(pmcQcReceipts.unitId, unitIds)));
    const byKey = new Map(existing.map(row => [`${row.unitId}/${row.activityDefinitionId}`, row]));
    const site = await tx.select({ unitId: pmcUnitActivityProgress.unitId, activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status })
      .from(pmcUnitActivityProgress).where(and(mine(pmcUnitActivityProgress, input), inArray(pmcUnitActivityProgress.unitId, unitIds)));
    const complete = new Set(site.filter(row => row.status === "COMPLETE").map(row => `${row.unitId}/${row.activityDefinitionId}`));
    let changed = 0; const notCompleteOnSite: string[] = [];
    for (const target of targets) {
      const key = `${target.unitId}/${target.activityDefinitionId}`;
      if (input.received && !complete.has(key)) notCompleteOnSite.push(target.villa);
      const row = byKey.get(key);
      if (row && row.received === input.received && row.receivedOn === input.date) continue;
      const receiptId = row?.id ?? randomUUID();
      if (row) await tx.update(pmcQcReceipts).set({ received: input.received, receivedOn: input.date, updatedByUserId: input.userId, updatedAt: now }).where(eq(pmcQcReceipts.id, row.id));
      else await tx.insert(pmcQcReceipts).values({ id: receiptId, tenantId: input.tenantId, projectId: input.projectId, unitId: target.unitId, activityDefinitionId: target.activityDefinitionId, received: input.received, receivedOn: input.date, updatedByUserId: input.userId });
      await tx.insert(pmcQcReceiptEvents).values({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, receiptId, fromReceived: row ? row.received : null, toReceived: input.received, receivedOn: input.date, changedByUserId: input.userId, changedAt: now });
      changed += 1;
    }
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.qc_receipt_batch_updated", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ activityCode: input.activityCode, received: input.received, date: input.date, villas: targets.length, changed }) });
    return { changed, unchanged: targets.length - changed, villas: targets.map(target => target.villa), warnings: notCompleteOnSite.length ? [{ code: "QC_NOT_COMPLETE_ON_SITE", villas: notCompleteOnSite }] : [] };
  });
}

/** Per activity code: how many villas are received and not received (a villa with no receipt yet counts as not received), out of the villas whose model has it. */
export async function pmcQcCounters(input: Scope) {
  const db = await authorize(input, "project.pmc.read");
  const [definitions, units, receipts] = await Promise.all([
    db.select({ id: pmcActivityDefinitions.id, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, modelCode: pmcActivityDefinitions.modelCode }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, input)),
    db.select({ modelCode: pmcUnits.modelCode }).from(pmcUnits).where(mine(pmcUnits, input)),
    db.select({ activityDefinitionId: pmcQcReceipts.activityDefinitionId, received: pmcQcReceipts.received }).from(pmcQcReceipts).where(and(mine(pmcQcReceipts, input), eq(pmcQcReceipts.received, true))),
  ]);
  const unitsPerModel = new Map<string, number>();
  for (const unit of units) unitsPerModel.set(unit.modelCode, (unitsPerModel.get(unit.modelCode) ?? 0) + 1);
  const receivedPerDefinition = new Map<string, number>();
  for (const receipt of receipts) receivedPerDefinition.set(receipt.activityDefinitionId, (receivedPerDefinition.get(receipt.activityDefinitionId) ?? 0) + 1);
  const byCode = new Map<string, { code: string; name: string; received: number; total: number }>();
  for (const definition of definitions) {
    const row = byCode.get(definition.code) ?? { code: definition.code, name: definition.name, received: 0, total: 0 };
    row.received += receivedPerDefinition.get(definition.id) ?? 0; row.total += unitsPerModel.get(definition.modelCode) ?? 0;
    byCode.set(definition.code, row);
  }
  return Array.from(byCode.values()).map(row => ({ ...row, notReceived: row.total - row.received })).sort((a, b) => a.code.localeCompare(b.code));
}

/** The latest QC changes (who, when, from → to), newest first; for one villa when asked. */
export async function listPmcQcHistory(input: Scope & { villa?: string; limit?: number }) {
  const db = await authorize(input, "project.pmc.read");
  let unitIds: string[] | null = null;
  if (input.villa) {
    const units = await db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel }).from(pmcUnits).where(mine(pmcUnits, input));
    unitIds = units.filter(unit => villaKey(unit.villaLabel ?? unit.unitNumber) === villaKey(input.villa)).map(unit => unit.id);
    if (!unitIds.length) return [];
  }
  return db.select({ at: pmcQcReceiptEvents.changedAt, on: pmcQcReceiptEvents.receivedOn, from: pmcQcReceiptEvents.fromReceived, to: pmcQcReceiptEvents.toReceived, by: users.name, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, activityCode: pmcActivityDefinitions.code, activityName: pmcActivityDefinitions.name })
    .from(pmcQcReceiptEvents)
    .innerJoin(pmcQcReceipts, eq(pmcQcReceipts.id, pmcQcReceiptEvents.receiptId))
    .innerJoin(pmcUnits, eq(pmcUnits.id, pmcQcReceipts.unitId))
    .innerJoin(pmcActivityDefinitions, eq(pmcActivityDefinitions.id, pmcQcReceipts.activityDefinitionId))
    .leftJoin(users, eq(users.id, pmcQcReceiptEvents.changedByUserId))
    .where(and(mine(pmcQcReceiptEvents, input), unitIds ? inArray(pmcQcReceipts.unitId, unitIds) : undefined))
    .orderBy(desc(pmcQcReceiptEvents.changedAt)).limit(Math.min(Math.max(input.limit ?? 30, 1), 100));
}

/** One villa's two states side by side, for its card: per activity, the site's status and the QC receipt. */
export async function pmcVillaStates(input: Scope & { villa: string }) {
  const db = await authorize(input, "project.pmc.read");
  const units = await db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, modelCode: pmcUnits.modelCode }).from(pmcUnits).where(mine(pmcUnits, input));
  const unit = units.find(item => villaKey(item.villaLabel ?? item.unitNumber) === villaKey(input.villa));
  if (!unit) return null;
  const [definitions, site, qc] = await Promise.all([
    db.select({ id: pmcActivityDefinitions.id, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions, input), eq(pmcActivityDefinitions.modelCode, unit.modelCode))),
    db.select({ activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status }).from(pmcUnitActivityProgress).where(and(mine(pmcUnitActivityProgress, input), eq(pmcUnitActivityProgress.unitId, unit.id))),
    db.select({ activityDefinitionId: pmcQcReceipts.activityDefinitionId, received: pmcQcReceipts.received, receivedOn: pmcQcReceipts.receivedOn }).from(pmcQcReceipts).where(and(mine(pmcQcReceipts, input), eq(pmcQcReceipts.unitId, unit.id))),
  ]);
  const siteBy = new Map(site.map(row => [row.activityDefinitionId, row.status]));
  const qcBy = new Map(qc.map(row => [row.activityDefinitionId, row]));
  return { villa: villaKey(unit.villaLabel ?? unit.unitNumber), modelCode: unit.modelCode, activities: definitions.map(definition => ({ code: definition.code, name: definition.name, siteStatus: siteBy.get(definition.id) ?? "NOT_STARTED", qcReceived: qcBy.get(definition.id)?.received ?? null, qcOn: qcBy.get(definition.id)?.receivedOn ?? null })) };
}

/** Q-8: one activity's QC state on every villa, for colouring the master plan: received / not received, or null where the villa's model has no such activity. */
export async function pmcQcMap(input: Scope & { activityCode: string }) {
  const db = await authorize(input, "project.pmc.read");
  const [units, definitions] = await Promise.all([
    db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, modelCode: pmcUnits.modelCode, blockCode: pmcBlocks.code }).from(pmcUnits).innerJoin(pmcBlocks, and(eq(pmcBlocks.id, pmcUnits.blockId), eq(pmcBlocks.tenantId, pmcUnits.tenantId))).where(mine(pmcUnits, input)),
    db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions, input), eq(pmcActivityDefinitions.code, input.activityCode))),
  ]);
  const receipts = definitions.length
    ? await db.select({ unitId: pmcQcReceipts.unitId, received: pmcQcReceipts.received }).from(pmcQcReceipts).where(and(mine(pmcQcReceipts, input), inArray(pmcQcReceipts.activityDefinitionId, definitions.map(definition => definition.id))))
    : [];
  const models = new Set(definitions.map(definition => definition.modelCode));
  const receivedBy = new Map(receipts.map(row => [row.unitId, row.received]));
  return units.sort((a, b) => a.unitNumber - b.unitNumber).map(unit => ({
    unitNumber: unit.unitNumber, modelCode: unit.modelCode, blockCode: unit.blockCode,
    status: models.has(unit.modelCode) ? ((receivedBy.get(unit.id) ?? false) ? "RECEIVED" as const : "NOT_RECEIVED" as const) : null,
  }));
}
