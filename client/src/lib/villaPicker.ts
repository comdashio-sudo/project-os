// Q-67 (2)(3): the field screens choose villas from the project's own data (pmc.progressPicker) — a phase, one or more blocks, a range between two existing
// villas, or villas ticked in a list — never a typed code. Pure: the screen keeps the choice, these turn it into the villas and the summary shown before the
// save (how many are chosen, which the activity does not apply to because of their model, which would move back from a higher status).
export type PickerVilla = { villa: string; number: number; block: string; phase: string | null; model: string; status: string | null };
export type VillaChoice =
  | { mode: "list"; villas: string[] }
  | { mode: "range"; from: string; to: string }
  | { mode: "block"; blocks: string[] }
  | { mode: "phase"; phases: string[] }
  | { mode: "model"; models: string[] };

/** The villas a choice covers, in the project's order (by villa number). An empty choice covers none. */
export function villasOf(all: PickerVilla[], choice: VillaChoice): PickerVilla[] {
  if (choice.mode === "list") { const wanted = new Set(choice.villas); return all.filter(villa => wanted.has(villa.villa)); }
  if (choice.mode === "range") {
    const from = all.findIndex(villa => villa.villa === choice.from); const to = all.findIndex(villa => villa.villa === choice.to);
    if (from < 0 || to < 0) return [];
    return all.slice(Math.min(from, to), Math.max(from, to) + 1);
  }
  const wanted = new Set(choice.mode === "block" ? choice.blocks : choice.mode === "phase" ? choice.phases : choice.models);
  const keyOf = (villa: PickerVilla) => (choice.mode === "block" ? villa.block : choice.mode === "phase" ? villa.phase ?? "" : villa.model);
  return all.filter(villa => wanted.has(keyOf(villa)));
}

const RANK: Record<string, number> = { NOT_STARTED: 0, IN_PROGRESS: 1, UNDER_REVIEW: 2, COMPLETE: 3 };

export type SelectionSummary = {
  chosen: number;
  /** the villas the save is sent with: the chosen villas whose model has the activity */
  applicable: string[];
  /** chosen villas whose model has no such activity — not sent, said by model */
  excluded: Array<{ villa: string; model: string }>;
  excludedModels: string[];
  /** applicable villas whose status now is higher than the new one (the save would move them back) */
  movingBack: Array<{ villa: string; from: string }>;
};

/** What the save would do, before it is made. `models` are the models that have the chosen activity (null while none is chosen: nothing is excluded). */
export function summarizeSelection(chosen: PickerVilla[], models: string[] | null, newStatus: string): SelectionSummary {
  const has = models ? new Set(models) : null;
  const applicable: PickerVilla[] = []; const excluded: Array<{ villa: string; model: string }> = [];
  for (const villa of chosen) { if (!has || has.has(villa.model)) applicable.push(villa); else excluded.push({ villa: villa.villa, model: villa.model }); }
  const movingBack = applicable.filter(villa => villa.status !== null && (RANK[villa.status] ?? 0) > (RANK[newStatus] ?? 0)).map(villa => ({ villa: villa.villa, from: villa.status! }));
  return { chosen: chosen.length, applicable: applicable.map(villa => villa.villa), excluded, excludedModels: Array.from(new Set(excluded.map(item => item.model))).sort(), movingBack };
}

/** The villas of the list that pass its filters (phase, block, model) and its search (part of the villa number or label). */
export function filterVillas(all: PickerVilla[], filters: { phase?: string; block?: string; model?: string; search?: string }): PickerVilla[] {
  const needle = (filters.search ?? "").trim().toLowerCase();
  return all.filter(villa => (!filters.phase || villa.phase === filters.phase) && (!filters.block || villa.block === filters.block) && (!filters.model || villa.model === filters.model)
    && (!needle || villa.villa.toLowerCase().includes(needle) || String(villa.number).includes(needle)));
}

// «Last used» activities, kept on this device per project (a convenience only: an empty or blocked storage shows none)
const RECENT_MAX = 5;
const recentKey = (projectId: string) => `project-os:recent-activities:${projectId}`;
export function readRecentActivities(projectId: string): string[] {
  try { const value = JSON.parse(window.localStorage.getItem(recentKey(projectId)) ?? "[]"); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, RECENT_MAX) : []; }
  catch { return []; }
}
export function rememberActivity(projectId: string, code: string): string[] {
  const next = [code, ...readRecentActivities(projectId).filter(item => item !== code)].slice(0, RECENT_MAX);
  try { window.localStorage.setItem(recentKey(projectId), JSON.stringify(next)); } catch { /* storage full or blocked: the list simply stays as it was */ }
  return next;
}
