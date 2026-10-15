// The numbers behind the PMC screens. Pure: the service loads one dataset for the
// project and every screen is a function of it, so each figure can be checked by
// hand against a small dataset (docs/PMC_PHASE_C_HAND_CHECKS.md).
import { calculateUnitProgress, normalizeUnitRange, type PmcUnitActivityStatus as Status } from "./pmc";

export const SCREEN_STATUSES: readonly Status[] = ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"];
export type PmcUnit = { id: string; number: number; modelCode: string; weight: number; zoneCode: string; blockCode: string; geometry?: unknown };
export type PmcDefinition = { id: string; modelCode: string; code: string; name: string; weightPercent: number; groupCode: string; groupName: string; stageCode: string; stageName: string };
export type PmcCell = { id: string; unitId: string; definitionId: string; status: Status; verificationStatusId: string | null; assignedUserId: number | null; lastChangedAt: Date };
export type PmcHistory = { unitId: string; definitionId: string; from: Status | null; to: Status; userId: number; at: Date };
export type PmcVerification = { id: string; code: string; label: string; pending: boolean; sortOrder: number };
export type PmcRequest = { id: string; code: string; definitionId: string; contractor: string | null; consultant: string | null; response: "A" | "B" | "C" | "UR" | null; requestedAt: Date; unitNumbers: number[]; steps: Array<{ code: string; status: string; holder: string | null; order: number }> };
export type PmcDataset = {
  now: Date;
  factors: Record<Status, number>;
  units: PmcUnit[];
  definitions: PmcDefinition[];
  cells: PmcCell[];
  history: PmcHistory[];
  verification: PmcVerification[];
  requests: PmcRequest[];
  baselines: Map<string, Array<{ at: Date; percent: number }>>;
  people: Map<number, string>;
  sources: Array<{ source: string; lastAt: Date | null }>;
};
export type PmcFilters = { zone?: string; block?: string; unitFrom?: number; unitTo?: number; group?: string; stage?: string; activity?: string; contractor?: string; consultant?: string; since?: Date; until?: Date };

const r2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const r4 = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;
const day = (date: Date) => date.toISOString().slice(0, 10);
const personName = (ds: PmcDataset, userId: number | null) => (userId === null ? null : (ds.people.get(userId) ?? `#${userId}`));

export function filterDataset(ds: PmcDataset, f: PmcFilters): PmcDataset {
  const units = ds.units.filter(u => (!f.zone || u.zoneCode === f.zone) && (!f.block || u.blockCode === f.block) && (f.unitFrom === undefined || u.number >= f.unitFrom) && (f.unitTo === undefined || u.number <= f.unitTo));
  const definitions = ds.definitions.filter(d => (!f.group || d.groupCode === f.group) && (!f.stage || d.stageCode === f.stage) && (!f.activity || d.code === f.activity));
  const unitIds = new Set(units.map(u => u.id));
  const unitNumbers = new Set(units.map(u => u.number));
  const definitionIds = new Set(definitions.map(d => d.id));
  const inWindow = (at: Date) => (!f.since || at >= f.since) && (!f.until || at <= f.until);
  const unitsFiltered = Boolean(f.zone || f.block || f.unitFrom !== undefined || f.unitTo !== undefined);
  return {
    ...ds,
    units,
    definitions,
    cells: ds.cells.filter(c => unitIds.has(c.unitId) && definitionIds.has(c.definitionId)),
    history: ds.history.filter(h => unitIds.has(h.unitId) && definitionIds.has(h.definitionId) && inWindow(h.at)),
    requests: ds.requests.filter(r => definitionIds.has(r.definitionId) && (!f.contractor || r.contractor === f.contractor) && (!f.consultant || r.consultant === f.consultant) && inWindow(r.requestedAt) && (!unitsFiltered || r.unitNumbers.some(n => unitNumbers.has(n)))),
  };
}

/** Every (unit x activity of the unit's model), with the stored cell if any: a cell nobody touched is NOT_STARTED. */
export function grid(ds: PmcDataset) {
  const byModel = new Map<string, PmcDefinition[]>();
  for (const d of ds.definitions) byModel.set(d.modelCode, [...(byModel.get(d.modelCode) ?? []), d]);
  const cellOf = new Map(ds.cells.map(c => [`${c.unitId}:${c.definitionId}`, c]));
  return ds.units.flatMap(unit => (byModel.get(unit.modelCode) ?? []).map(definition => { const cell = cellOf.get(`${unit.id}:${definition.id}`) ?? null; return { unit, definition, cell, status: (cell?.status ?? "NOT_STARTED") as Status }; }));
}

const credit = (ds: PmcDataset, h: PmcHistory) => ds.factors[h.to] - ds.factors[h.from ?? "NOT_STARTED"];

// ---------------------------------------------------------------- screen 1

export function latestUpdates(ds: PmcDataset) {
  const totalUnitWeight = ds.units.reduce((sum, u) => sum + u.weight, 0) || 1;
  const unitById = new Map(ds.units.map(u => [u.id, u]));
  const defById = new Map(ds.definitions.map(d => [d.id, d]));
  const perUser = new Map<number, PmcHistory[]>();
  for (const h of ds.history) perUser.set(h.userId, [...(perUser.get(h.userId) ?? []), h]);
  const engineers = Array.from(perUser, ([userId, rows]) => {
    const perDay = new Map<string, number>();
    const byGroup = new Map<string, { groupName: string; added: number; updates: number }>();
    let added = 0;
    for (const h of rows) {
      const unit = unitById.get(h.unitId)!;
      const def = defById.get(h.definitionId)!;
      const projectPoints = (unit.weight * def.weightPercent * credit(ds, h)) / totalUnitWeight;
      added += projectPoints;
      perDay.set(day(h.at), (perDay.get(day(h.at)) ?? 0) + 1);
      const group = byGroup.get(def.groupCode) ?? { groupName: def.groupName, added: 0, updates: 0 };
      byGroup.set(def.groupCode, { groupName: group.groupName, added: group.added + projectPoints, updates: group.updates + 1 });
    }
    const range = normalizeUnitRange(rows.map(h => unitById.get(h.unitId)!.number));
    return { userId, name: personName(ds, userId)!, updates: rows.length, activeDays: perDay.size, perDay: Array.from(perDay, ([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date, undefined, { numeric: true })), unitFrom: range.from, unitTo: range.to, addedProjectPercent: r4(added), byGroup: Array.from(byGroup, ([groupCode, v]) => ({ groupCode, groupName: v.groupName, addedProjectPercent: r4(v.added), updates: v.updates })).sort((a, b) => a.groupCode.localeCompare(b.groupCode, undefined, { numeric: true })) };
  }).sort((a, b) => b.updates - a.updates || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { engineers, totals: { updates: ds.history.length, addedProjectPercent: r4(engineers.reduce((s, e) => s + e.addedProjectPercent, 0)) } };
}

// ---------------------------------------------------------------- screens 2 and 4

type Reply = "A" | "B" | "C" | "UR" | "pending";
const emptyReplies = () => ({ A: 0, B: 0, C: 0, UR: 0, pending: 0, total: 0 });
const replyOf = (r: PmcRequest): Reply => r.response ?? "pending";

export function approvals(ds: PmcDataset) {
  const defById = new Map(ds.definitions.map(d => [d.id, d]));
  const bucket = <K extends string>(key: (r: PmcRequest) => K) => {
    const map = new Map<K, ReturnType<typeof emptyReplies>>();
    for (const r of ds.requests) { const entry = map.get(key(r)) ?? emptyReplies(); entry[replyOf(r)] += 1; entry.total += 1; map.set(key(r), entry); }
    return Array.from(map, ([k, counts]) => ({ key: k, ...counts })).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  };
  return {
    requests: ds.requests.slice().sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime() || a.code.localeCompare(b.code, undefined, { numeric: true })).map(r => ({ code: r.code, activityCode: defById.get(r.definitionId)?.code ?? "", activityName: defById.get(r.definitionId)?.name ?? "", requestedAt: r.requestedAt, contractor: r.contractor, consultant: r.consultant, response: r.response, units: r.unitNumbers.length })),
    byConsultant: bucket(r => r.consultant ?? "—"),
    byDay: bucket(r => day(r.requestedAt)),
    byActivity: bucket(r => defById.get(r.definitionId)?.code ?? "—"),
    contractors: Array.from(new Set(ds.requests.flatMap(r => (r.contractor ? [r.contractor] : [])))).sort(),
    consultants: Array.from(new Set(ds.requests.flatMap(r => (r.consultant ? [r.consultant] : [])))).sort(),
  };
}

const currentStep = (r: PmcRequest) => (r.response ? "ANSWERED" : (r.steps.find(s => s.status === "in_progress")?.code ?? (r.steps.some(s => s.status === "rejected") ? "REJECTED" : "NOT_STARTED")));

export function inspections(ds: PmcDataset) {
  const defById = new Map(ds.definitions.map(d => [d.id, d]));
  const total = ds.requests.length;
  const stages = new Map<string, number>();
  const holders = new Map<string, number>();
  const stalled = new Map<string, { name: string; open: number; oldest: Date }>();
  for (const r of ds.requests) {
    const stage = currentStep(r);
    stages.set(stage, (stages.get(stage) ?? 0) + 1);
    if (stage === "ANSWERED") continue;
    const holder = r.steps.find(s => s.status === "in_progress")?.holder ?? "—";
    holders.set(holder, (holders.get(holder) ?? 0) + 1);
    const def = defById.get(r.definitionId);
    const key = def?.code ?? "—";
    const entry = stalled.get(key) ?? { name: def?.name ?? "", open: 0, oldest: r.requestedAt };
    stalled.set(key, { name: entry.name, open: entry.open + 1, oldest: r.requestedAt < entry.oldest ? r.requestedAt : entry.oldest });
  }
  const order = ["CONFIGURATIONS", "MANAGER_APPROVAL", "TECHNICAL_ASSISTANT", "WAITING_CONSULTANT", "RESULT_RECEIVING", "ANSWERED", "REJECTED", "NOT_STARTED"];
  return {
    total,
    byStage: order.filter(s => stages.has(s)).map(stage => ({ stage, count: stages.get(stage)!, percent: r2((stages.get(stage)! / total) * 100) })),
    heldBy: Array.from(holders, ([holder, count]) => ({ holder, count })).sort((a, b) => b.count - a.count || a.holder.localeCompare(b.holder, undefined, { numeric: true })),
    stalledActivities: Array.from(stalled, ([activityCode, v]) => ({ activityCode, activityName: v.name, open: v.open, oldestDays: Math.floor((ds.now.getTime() - v.oldest.getTime()) / 86_400_000) })).sort((a, b) => b.open - a.open || b.oldestDays - a.oldestDays || a.activityCode.localeCompare(b.activityCode, undefined, { numeric: true })),
  };
}

// ---------------------------------------------------------------- screen 5

export function activitiesMatrix(ds: PmcDataset) {
  const columns = [...ds.verification.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, undefined, { numeric: true })).map(v => ({ id: v.id as string | null, code: v.code, label: v.label })), { id: null as string | null, code: "—", label: "—" }];
  const cells = grid(ds);
  const groups = new Map<string, { groupName: string; activities: Map<string, { name: string; cells: Map<string | null, { count: number; weight: number }>; total: number; weight: number }> }>();
  for (const { definition, cell } of cells) {
    const group = groups.get(definition.groupCode) ?? { groupName: definition.groupName, activities: new Map() };
    const activity = group.activities.get(definition.code) ?? { name: definition.name, cells: new Map(), total: 0, weight: 0 };
    const key = cell?.verificationStatusId ?? null;
    const slot = activity.cells.get(key) ?? { count: 0, weight: 0 };
    activity.cells.set(key, { count: slot.count + 1, weight: slot.weight + definition.weightPercent });
    activity.total += 1;
    activity.weight += definition.weightPercent;
    group.activities.set(definition.code, activity);
    groups.set(definition.groupCode, group);
  }
  const render = (cellsMap: Map<string | null, { count: number; weight: number }>, totalWeight: number) => columns.map(c => { const slot = cellsMap.get(c.id) ?? { count: 0, weight: 0 }; return { statusId: c.id, count: slot.count, weightPoints: r2(slot.weight), sharePercent: totalWeight ? r2((slot.weight / totalWeight) * 100) : 0 }; });
  return {
    columns,
    groups: Array.from(groups, ([groupCode, g]) => {
      const merged = new Map<string | null, { count: number; weight: number }>();
      let groupWeight = 0;
      g.activities.forEach(a => { groupWeight += a.weight; a.cells.forEach((slot, key) => { const m = merged.get(key) ?? { count: 0, weight: 0 }; merged.set(key, { count: m.count + slot.count, weight: m.weight + slot.weight }); }); });
      return { groupCode, groupName: g.groupName, cells: render(merged, groupWeight), activities: Array.from(g.activities, ([code, a]) => ({ code, name: a.name, total: a.total, cells: render(a.cells, a.weight) })).sort((x, y) => x.code.localeCompare(y.code)) };
    }).sort((a, b) => a.groupCode.localeCompare(b.groupCode, undefined, { numeric: true })),
  };
}

// ---------------------------------------------------------------- screen 6

export function zones(ds: PmcDataset) {
  const rows = new Map<string, { zoneCode: string; stageCode: string; stageName: string; userId: number | null; cells: number; complete: number; weightComplete: number }>();
  for (const { unit, definition, cell, status } of grid(ds)) {
    const userId = cell?.assignedUserId ?? null;
    const key = `${unit.zoneCode}\u0000${definition.stageCode}\u0000${userId ?? ""}`;
    const row = rows.get(key) ?? { zoneCode: unit.zoneCode, stageCode: definition.stageCode, stageName: definition.stageName, userId, cells: 0, complete: 0, weightComplete: 0 };
    row.cells += 1;
    if (status === "COMPLETE") { row.complete += 1; row.weightComplete += definition.weightPercent; }
    rows.set(key, row);
  }
  return { rows: Array.from(rows.values()).map(r => ({ zoneCode: r.zoneCode, stageCode: r.stageCode, stageName: r.stageName, engineer: personName(ds, r.userId), cells: r.cells, completeCells: r.complete, weightComplete: r2(r.weightComplete), completionPercent: r2((r.complete / r.cells) * 100) })).sort((a, b) => a.zoneCode.localeCompare(b.zoneCode, undefined, { numeric: true }) || a.stageCode.localeCompare(b.stageCode, undefined, { numeric: true }) || (a.engineer ?? "").localeCompare(b.engineer ?? "", undefined, { numeric: true })) };
}

// ---------------------------------------------------------------- screens 7 and 8

const weekStart = (date: Date) => { const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); const offset = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - offset); return d; };
const monthStartOf = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

export function periodReport(ds: PmcDataset, period: "week" | "month") {
  const totalUnitWeight = ds.units.reduce((sum, u) => sum + u.weight, 0) || 1;
  const unitById = new Map(ds.units.map(u => [u.id, u]));
  const defById = new Map(ds.definitions.map(d => [d.id, d]));
  const periods = new Map<string, { updates: number; added: number; byGroup: Map<string, number>; byStatus: Map<Status, number>; rows: Map<string, { engineer: string; activityCode: string; updates: number; units: number }> }>();
  for (const h of ds.history) {
    const key = (period === "week" ? weekStart(h.at) : monthStartOf(h.at)).toISOString().slice(0, 10);
    const unit = unitById.get(h.unitId)!;
    const def = defById.get(h.definitionId)!;
    const p = periods.get(key) ?? { updates: 0, added: 0, byGroup: new Map(), byStatus: new Map(), rows: new Map() };
    const points = (unit.weight * def.weightPercent * credit(ds, h)) / totalUnitWeight;
    p.updates += 1;
    p.added += points;
    p.byGroup.set(def.groupCode, (p.byGroup.get(def.groupCode) ?? 0) + points);
    p.byStatus.set(h.to, (p.byStatus.get(h.to) ?? 0) + 1);
    const rowKey = `${h.userId}\u0000${def.code}`;
    const row = p.rows.get(rowKey) ?? { engineer: personName(ds, h.userId)!, activityCode: def.code, updates: 0, units: 0 };
    p.rows.set(rowKey, { ...row, updates: row.updates + 1, units: row.units + 1 });
    periods.set(key, p);
  }
  return { period, periods: Array.from(periods, ([from, p]) => ({ from, updates: p.updates, addedProjectPercent: r4(p.added), byGroup: Array.from(p.byGroup, ([groupCode, v]) => ({ groupCode, addedProjectPercent: r4(v) })).sort((a, b) => a.groupCode.localeCompare(b.groupCode, undefined, { numeric: true })), byStatus: SCREEN_STATUSES.filter(s => p.byStatus.has(s)).map(status => ({ status, updates: p.byStatus.get(status)! })), rows: Array.from(p.rows.values()).sort((a, b) => a.engineer.localeCompare(b.engineer, undefined, { numeric: true }) || a.activityCode.localeCompare(b.activityCode, undefined, { numeric: true })) })).sort((a, b) => b.from.localeCompare(a.from)) };
}

// ---------------------------------------------------------------- screen 9

export function pendingAtVerifier(ds: PmcDataset) {
  const pendingIds = new Set(ds.verification.filter(v => v.pending).map(v => v.id));
  const labelOf = new Map(ds.verification.map(v => [v.id, v.label]));
  const unitById = new Map(ds.units.map(u => [u.id, u]));
  const defById = new Map(ds.definitions.map(d => [d.id, d]));
  const rows = ds.cells.filter(c => c.verificationStatusId && pendingIds.has(c.verificationStatusId)).map(c => ({ unitNumber: unitById.get(c.unitId)!.number, activityCode: defById.get(c.definitionId)!.code, activityName: defById.get(c.definitionId)!.name, verificationStatus: labelOf.get(c.verificationStatusId!)!, engineer: personName(ds, c.assignedUserId), since: c.lastChangedAt, ageDays: Math.max(0, Math.floor((ds.now.getTime() - c.lastChangedAt.getTime()) / 86_400_000)) })).sort((a, b) => b.ageDays - a.ageDays || a.unitNumber - b.unitNumber || a.activityCode.localeCompare(b.activityCode, undefined, { numeric: true }));
  const buckets = [{ label: "0-7", from: 0, to: 7 }, { label: "8-14", from: 8, to: 14 }, { label: "15-30", from: 15, to: 30 }, { label: "31+", from: 31, to: Infinity }];
  return { total: rows.length, buckets: buckets.map(b => ({ label: b.label, count: rows.filter(r => r.ageDays >= b.from && r.ageDays <= b.to).length })), rows };
}

// ---------------------------------------------------------------- screen 11

export function stagesView(ds: PmcDataset) {
  const stages = new Map<string, { stageName: string; counts: Record<Status, number>; weight: Record<Status, number> }>();
  const perActivity = new Map<string, { definition: PmcDefinition; included: number; complete: number }>();
  for (const { definition, status } of grid(ds)) {
    const s = stages.get(definition.stageCode) ?? { stageName: definition.stageName, counts: { NOT_STARTED: 0, IN_PROGRESS: 0, UNDER_REVIEW: 0, COMPLETE: 0 }, weight: { NOT_STARTED: 0, IN_PROGRESS: 0, UNDER_REVIEW: 0, COMPLETE: 0 } };
    s.counts[status] += 1;
    s.weight[status] += definition.weightPercent;
    stages.set(definition.stageCode, s);
    const a = perActivity.get(definition.id) ?? { definition, included: 0, complete: 0 };
    a.included += 1;
    if (status === "COMPLETE") a.complete += 1;
    perActivity.set(definition.id, a);
  }
  // An activity is late when fewer of its units are complete than the baseline planned by now.
  const plannedByNow = (definitionId: string) => { const points = (ds.baselines.get(definitionId) ?? []).filter(p => p.at <= ds.now).sort((a, b) => a.at.getTime() - b.at.getTime()); return points.length ? points[points.length - 1].percent : null; };
  const late = new Map<string, Array<{ activityCode: string; actualPercent: number; plannedPercent: number }>>();
  perActivity.forEach(a => {
    const planned = plannedByNow(a.definition.id);
    const actual = a.included === 0 ? 0 : r2((a.complete / a.included) * 100);
    if (planned !== null && actual < planned - 0.0001) late.set(a.definition.stageCode, [...(late.get(a.definition.stageCode) ?? []), { activityCode: a.definition.code, actualPercent: actual, plannedPercent: planned }]);
  });
  return { stages: Array.from(stages, ([stageCode, s]) => { const total = SCREEN_STATUSES.reduce((sum, st) => sum + s.counts[st], 0); const totalWeight = SCREEN_STATUSES.reduce((sum, st) => sum + s.weight[st], 0); return { stageCode, stageName: s.stageName, total, byStatus: SCREEN_STATUSES.map(status => ({ status, count: s.counts[status], weightPoints: r2(s.weight[status]), percent: total ? r2((s.counts[status] / total) * 100) : 0, weightSharePercent: totalWeight ? r2((s.weight[status] / totalWeight) * 100) : 0 })), lateActivities: (late.get(stageCode) ?? []).sort((a, b) => a.activityCode.localeCompare(b.activityCode, undefined, { numeric: true })) }; }).sort((a, b) => a.stageCode.localeCompare(b.stageCode, undefined, { numeric: true })) };
}

export const freshnessOf = (ds: PmcDataset) => ds.sources.map(s => ({ source: s.source, lastAt: s.lastAt, ageDays: s.lastAt ? Math.max(0, Math.floor((ds.now.getTime() - s.lastAt.getTime()) / 86_400_000)) : null }));

// ---------------------------------------------------------------- screen 3 (site plan) and the unit card

/** A unit's progress, or null with the reason when its model's weights do not total 100. */
export function unitProgressOf(ds: PmcDataset, unit: PmcUnit) {
  const definitions = ds.definitions.filter(d => d.modelCode === unit.modelCode);
  const statusOf = new Map(ds.cells.filter(c => c.unitId === unit.id).map(c => [c.definitionId, c.status]));
  try { return calculateUnitProgress({ statusFactors: ds.factors, activities: definitions.map(d => ({ weightPercent: d.weightPercent, status: statusOf.get(d.id) ?? "NOT_STARTED" })) }); } catch { return null; }
}

/** Each unit with its polygon and, for the chosen activity, its status; without an activity, its overall progress. */
export function siteMap(ds: PmcDataset, activityCode?: string) {
  const definitionOf = new Map(ds.definitions.filter(d => !activityCode || d.code === activityCode).map(d => [d.modelCode + "\u0000" + d.code, d]));
  const cellOf = new Map(ds.cells.map(c => [`${c.unitId}:${c.definitionId}`, c]));
  return ds.units.slice().sort((a, b) => a.number - b.number).map(unit => {
    const definition = activityCode ? definitionOf.get(unit.modelCode + "\u0000" + activityCode) : undefined;
    const cell = definition ? cellOf.get(`${unit.id}:${definition.id}`) : undefined;
    return { unitNumber: unit.number, modelCode: unit.modelCode, zoneCode: unit.zoneCode, blockCode: unit.blockCode, geometry: unit.geometry ?? null, status: activityCode ? (definition ? (cell?.status ?? ("NOT_STARTED" as Status)) : null) : null, progressPercent: activityCode ? null : unitProgressOf(ds, unit) };
  });
}

export function unitCard(ds: PmcDataset, unitNumber: number) {
  const unit = ds.units.find(u => u.number === unitNumber);
  if (!unit) return null;
  const cellOf = new Map(ds.cells.filter(c => c.unitId === unit.id).map(c => [c.definitionId, c]));
  const verification = new Map(ds.verification.map(v => [v.id, v.label]));
  return {
    unitId: unit.id, unitNumber: unit.number, modelCode: unit.modelCode, zoneCode: unit.zoneCode, blockCode: unit.blockCode, progressPercent: unitProgressOf(ds, unit),
    activities: ds.definitions.filter(d => d.modelCode === unit.modelCode).map(d => { const cell = cellOf.get(d.id); return { definitionId: d.id, code: d.code, name: d.name, groupName: d.groupName, stageName: d.stageName, weightPercent: d.weightPercent, status: (cell?.status ?? "NOT_STARTED") as Status, verificationStatus: cell?.verificationStatusId ? (verification.get(cell.verificationStatusId) ?? null) : null, engineer: personName(ds, cell?.assignedUserId ?? null), lastChangedAt: cell?.lastChangedAt ?? null }; }).sort((a, b) => a.groupName.localeCompare(b.groupName, undefined, { numeric: true }) || a.code.localeCompare(b.code, undefined, { numeric: true })),
  };
}

// ---------------------------------------------------------------- screen 10

const monthKeyOf = (date: Date) => monthStartOf(date).toISOString().slice(0, 10);
const nextMonthKey = (key: string) => { const d = new Date(`${key}T00:00:00.000Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10); };

/**
 * Planned against actual project progress by month, cumulative and per month.
 * Planned = the imported baseline: each activity's planned completion (carried forward from its latest
 * point at or before the month) x its weight in the unit x the unit's weight, over the project.
 * Actual = the credit the status history added up to the end of the month (the same credit screens 1, 7 and 8 sum),
 * so the last point equals the project's progress whenever every cell has history.
 */
export function programme(ds: PmcDataset) {
  const totalUnitWeight = ds.units.reduce((sum, u) => sum + u.weight, 0) || 1;
  const unitById = new Map(ds.units.map(u => [u.id, u]));
  const defById = new Map(ds.definitions.map(d => [d.id, d]));
  const nowKey = monthKeyOf(ds.now);

  const points = Array.from(ds.baselines.entries()).flatMap(([definitionId, list]) => (defById.has(definitionId) ? list.map(p => ({ definitionId, key: monthKeyOf(p.at), percent: p.percent })) : []));
  const hasBaseline = points.length > 0;
  const historyKeys = ds.history.map(h => monthKeyOf(h.at));
  const allKeys = [...points.map(p => p.key), ...historyKeys, nowKey].sort();
  if (!allKeys.length) return { hasBaseline, months: [] as Array<{ month: string; planned: number | null; actual: number | null; plannedInMonth: number | null; actualInMonth: number | null; variance: number | null }>, plannedToDate: null as number | null, actualToDate: 0, progressFromCells: 0, cellsWithoutHistory: 0 };
  const months: string[] = [];
  for (let key = allKeys[0]; key <= allKeys[allKeys.length - 1]; key = nextMonthKey(key)) months.push(key);

  const byDefinition = new Map<string, Array<{ key: string; percent: number }>>();
  for (const p of points) byDefinition.set(p.definitionId, [...(byDefinition.get(p.definitionId) ?? []), { key: p.key, percent: p.percent }]);
  byDefinition.forEach(list => list.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)));
  const unitsByModel = new Map<string, number>();
  for (const u of ds.units) unitsByModel.set(u.modelCode, (unitsByModel.get(u.modelCode) ?? 0) + u.weight);
  const plannedAt = (key: string) => {
    let total = 0;
    for (const [definitionId, list] of Array.from(byDefinition.entries())) {
      const definition = defById.get(definitionId)!;
      let percent = 0;
      for (const p of list) { if (p.key <= key) percent = p.percent; else break; }
      total += ((unitsByModel.get(definition.modelCode) ?? 0) * definition.weightPercent * percent) / 100;
    }
    return total / totalUnitWeight;
  };

  const addedInMonth = new Map<string, number>();
  for (const h of ds.history) {
    const unit = unitById.get(h.unitId);
    const def = defById.get(h.definitionId);
    if (!unit || !def) continue;
    const key = monthKeyOf(h.at);
    addedInMonth.set(key, (addedInMonth.get(key) ?? 0) + (unit.weight * def.weightPercent * credit(ds, h)) / totalUnitWeight);
  }

  let cumulativeActual = 0;
  let previousPlanned = 0;
  const rows = months.map(month => {
    const inMonth = addedInMonth.get(month) ?? 0;
    cumulativeActual += inMonth;
    const planned = hasBaseline ? plannedAt(month) : null;
    const future = month > nowKey;
    const row = {
      month,
      planned: planned === null ? null : r4(planned),
      actual: future ? null : r4(cumulativeActual),
      plannedInMonth: planned === null ? null : r4(planned - previousPlanned),
      actualInMonth: future ? null : r4(inMonth),
      variance: planned === null || future ? null : r4(cumulativeActual - planned),
    };
    if (planned !== null) previousPlanned = planned;
    return row;
  });

  const cellOf = new Set(ds.history.map(h => `${h.unitId}:${h.definitionId}`));
  const cellsWithoutHistory = ds.cells.filter(c => c.status !== "NOT_STARTED" && !cellOf.has(`${c.unitId}:${c.definitionId}`)).length;
  const unitProgress = ds.units.map(u => ({ weight: u.weight, progress: unitProgressOf(ds, u) }));
  const progressFromCells = r4(unitProgress.reduce((sum, u) => sum + u.weight * (u.progress ?? 0), 0) / totalUnitWeight);
  const current = rows.find(r => r.month === nowKey);
  return { hasBaseline, months: rows, plannedToDate: current?.planned ?? null, actualToDate: current?.actual ?? 0, progressFromCells, cellsWithoutHistory };
}
