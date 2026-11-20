// Q-54: the master-plan status board (reference «الماستر بلان»): villas grouped under their block, each coloured by one of six states.
// Pure functions so the grouping and the state rule are tested without a browser.

export type BoardState = "complete" | "advanced" | "progress" | "start" | "none" | "stopped";
export const BOARD_STATES: BoardState[] = ["complete", "advanced", "progress", "start", "none", "stopped"];

/** The six state tokens of the identity (index.css --state-*). */
export const BOARD_STATE_CLASS: Record<BoardState, string> = {
  complete: "bg-state-complete text-state-complete-foreground border-transparent",
  advanced: "bg-state-advanced text-state-advanced-foreground border-transparent",
  progress: "bg-state-progress text-state-progress-foreground border-transparent",
  start: "bg-state-start text-state-start-foreground border-border",
  none: "bg-state-none text-state-none-foreground border-border",
  stopped: "bg-state-stopped text-state-stopped-foreground border-transparent",
};

export type BoardEntity = { id: string; code: string; name: string; entityType: string; parentEntityId: string | null; status: string; progressPercent: string | number | null };

const progressOf = (entity: Pick<BoardEntity, "progressPercent">) => { const value = Number(entity.progressPercent ?? 0); return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0; };

/** Status wins over progress: blocked is stopped and completed is complete whatever the percentage; otherwise the percentage picks the band. */
export function boardStateOf(entity: Pick<BoardEntity, "status" | "progressPercent">): BoardState {
  if (entity.status === "blocked") return "stopped";
  const progress = progressOf(entity);
  if (entity.status === "completed" || progress >= 100) return "complete";
  if (progress >= 60) return "advanced";
  if (progress >= 25) return "progress";
  if (progress > 0 || entity.status === "in_progress") return "start";
  return "none";
}

export type BoardBlock = { id: string; code: string; name: string; progress: number; units: (BoardEntity & { state: BoardState; progress: number })[] };

/** Units under their parent block, in code order; units without a block share one group with an empty id. Average progress per block. */
export function groupBoard(entities: BoardEntity[]): BoardBlock[] {
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const units = entities.filter(entity => entity.entityType === "unit");
  const groups = new Map<string, BoardBlock>();
  type BoardUnit = BoardBlock["units"][number];
  for (const unit of units) {
    const parent = unit.parentEntityId ? byId.get(unit.parentEntityId) : undefined;
    const key = parent?.id ?? "";
    if (!groups.has(key)) groups.set(key, { id: key, code: parent?.code ?? "", name: parent?.name ?? "", progress: 0, units: [] });
    groups.get(key)!.units.push({ ...unit, state: boardStateOf(unit), progress: progressOf(unit) });
  }
  const order = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
  return Array.from(groups.values())
    .map(group => ({ ...group, units: group.units.sort((a: BoardUnit, b: BoardUnit) => order(a.code, b.code)), progress: Math.round(group.units.reduce((sum: number, unit: BoardUnit) => sum + unit.progress, 0) / group.units.length) }))
    .sort((a, b) => (a.id === "" ? 1 : b.id === "" ? -1 : order(a.code, b.code)));
}

export function countStates(blocks: BoardBlock[]): Record<BoardState, number> {
  const counts = Object.fromEntries(BOARD_STATES.map(state => [state, 0])) as Record<BoardState, number>;
  for (const block of blocks) for (const unit of block.units) counts[unit.state] += 1;
  return counts;
}
