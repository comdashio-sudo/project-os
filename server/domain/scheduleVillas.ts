// Q-61 (2): which villa each activity of a P6 schedule belongs to, and where the schedule and the project's villas disagree. Read only: nothing is changed on
// either side; the differences are shown for a person to settle. A villa's activities are found from the WBS — the nearest node whose short name is «V606»
// (or «Villa 606») — or, failing that, from the activity code's prefix («V606.Q02», «V606-…»). The villa's type and block in P6's activity codes («Villa Type»,
// «Block») are compared with the villa's model and block in the project. Pure: the caller loads the rows.

export type ScheduleWbs = { id: string; parentId: string | null; code: string; name: string };
export type ScheduleActivity = { id: string; code: string; name: string; wbsItemId: string | null; codes: Record<string, string> };
export type ProjectVilla = { unitNumber: number; modelCode: string; blockCode: string };
export type VillaMismatch = { unitNumber: number; field: "model" | "block"; schedule: string; project: string; activities: number };
export type VillaLinks = {
  activities: number; linkedActivities: number; unlinkedActivities: number;
  villasInSchedule: number; villasMatched: number;
  /** villas the schedule names that the project does not have (by number) */
  missingInProject: number[];
  /** villas the project has that no activity names */
  withoutActivities: number[];
  mismatches: VillaMismatch[];
  villas: Array<{ unitNumber: number; activities: number; inProject: boolean; qItems: string[] }>;
};

/** «V606», «v606», «Villa 606», «VILLA-606» → 606; anything else → null. The last segment of a dotted WBS path is read («PH1.B25.V606»). */
export function villaNumberFromName(text: string): number | null {
  const last = text.trim().split(".").pop() ?? "";
  const match = /^(?:v|villa)[\s\-_]*0*(\d{1,6})$/i.exec(last.trim());
  return match ? Number(match[1]) : null;
}
/** «V606.Q02», «V606-Q02», «V606_Q02» → 606 */
export function villaNumberFromActivityCode(code: string): number | null {
  const match = /^(?:v|villa)[\s\-_]*0*(\d{1,6})[.\-_]/i.exec(code.trim());
  return match ? Number(match[1]) : null;
}

// P6 activity-code type names, in English and Arabic, as owners name them. The broad names («type», «item») are read only when the explicit one
// («Villa Type», «Q Item») is not on the activity (review of #549, note 3).
const TYPE_ALIASES = {
  model: { primary: ["villa type", "unit type", "model", "نوع الفيلا", "النموذج"], fallback: ["type"] },
  block: { primary: ["block", "البلوك", "المبنى"], fallback: [] },
  qItem: { primary: ["q item", "q-item", "qitem"], fallback: ["item"] },
} as const;
type Aliases = { primary: readonly string[]; fallback: readonly string[] };
const typeKey = (name: string) => name.trim().toLowerCase();
const pickFrom = (codes: Record<string, string>, names: readonly string[]) => {
  for (const [type, value] of Object.entries(codes)) if (names.includes(typeKey(type)) && value.trim()) return value.trim();
  return null;
};
const pick = (codes: Record<string, string>, aliases: Aliases) => pickFrom(codes, aliases.primary) ?? pickFrom(codes, aliases.fallback);
/** «type C», «C», «Type-C» → «C»; «BLK 25», «B25», «Block 25» → «25» — the comparable part of a value */
const comparableModel = (value: string) => value.trim().replace(/^type[\s\-_]*/i, "").toUpperCase();
const comparableBlock = (value: string) => value.trim().replace(/^(?:blk|block|b)[\s\-_]*/i, "").replace(/^0+(?=\d)/, "").toUpperCase();

/** Each activity's villa number (activity id → number), from the nearest WBS node «V606» above it, else from its code's prefix; activities with neither are left out. */
export function villaOfEachActivity(wbs: ScheduleWbs[], activities: Array<Pick<ScheduleActivity, "id" | "code" | "wbsItemId">>): Map<string, number> {
  const wbsById = new Map(wbs.map(node => [node.id, node]));
  const villaOfWbs = new Map<string, number | null>();
  const fromWbs = (id: string | null): number | null => {
    const seen: string[] = [];
    let current = id;
    while (current && seen.length < 60) {
      if (villaOfWbs.has(current)) { const found = villaOfWbs.get(current)!; for (const node of seen) villaOfWbs.set(node, found); return found; }
      seen.push(current);
      const node = wbsById.get(current);
      if (!node) break;
      const found = villaNumberFromName(node.code) ?? villaNumberFromName(node.name);
      if (found !== null) { for (const visited of seen) villaOfWbs.set(visited, found); return found; }
      current = node.parentId;
    }
    for (const node of seen) villaOfWbs.set(node, null);
    return null;
  };
  const out = new Map<string, number>();
  for (const activity of activities) {
    const number = fromWbs(activity.wbsItemId) ?? villaNumberFromActivityCode(activity.code);
    if (number !== null) out.set(activity.id, number);
  }
  return out;
}

export function linkScheduleToVillas(input: { wbs: ScheduleWbs[]; activities: ScheduleActivity[]; villas: ProjectVilla[] }): VillaLinks {
  const villaOf = villaOfEachActivity(input.wbs, input.activities);
  const project = new Map(input.villas.map(villa => [villa.unitNumber, villa]));
  const byVilla = new Map<number, ScheduleActivity[]>();
  let linked = 0;
  for (const activity of input.activities) {
    const number = villaOf.get(activity.id);
    if (number === undefined) continue;
    linked += 1;
    (byVilla.get(number) ?? byVilla.set(number, []).get(number)!).push(activity);
  }
  const mismatches: VillaMismatch[] = [];
  const villas: VillaLinks["villas"] = [];
  for (const [number, activities] of Array.from(byVilla.entries()).sort((a, b) => a[0] - b[0])) {
    const villa = project.get(number);
    const qItems = Array.from(new Set(activities.map(activity => pick(activity.codes, TYPE_ALIASES.qItem)).filter((value): value is string => Boolean(value)))).sort();
    villas.push({ unitNumber: number, activities: activities.length, inProject: Boolean(villa), qItems });
    if (!villa) continue;
    // the value most of the villa's activities carry (one stray activity does not decide it)
    // a tie that includes the project's own value is not a difference (review of #549, note 4)
    const differs = (aliases: Aliases, normalise: (value: string) => string, projectValue: string) => {
      const counts = new Map<string, { raw: string; n: number }>();
      for (const activity of activities) { const raw = pick(activity.codes, aliases); if (!raw) continue; const key = normalise(raw); const entry = counts.get(key) ?? { raw, n: 0 }; entry.n += 1; counts.set(key, entry); }
      const ranked = Array.from(counts.entries()).sort((a, b) => b[1].n - a[1].n);
      if (!ranked.length) return null;
      const top = ranked.filter(entry => entry[1].n === ranked[0][1].n);
      return top.some(entry => entry[0] === normalise(projectValue)) ? null : ranked[0][1].raw;
    };
    const model = differs(TYPE_ALIASES.model, comparableModel, villa.modelCode);
    if (model !== null) mismatches.push({ unitNumber: number, field: "model", schedule: model, project: villa.modelCode, activities: activities.length });
    const block = differs(TYPE_ALIASES.block, comparableBlock, villa.blockCode);
    if (block !== null) mismatches.push({ unitNumber: number, field: "block", schedule: block, project: villa.blockCode, activities: activities.length });
  }
  const named = new Set(byVilla.keys());
  return {
    activities: input.activities.length, linkedActivities: linked, unlinkedActivities: input.activities.length - linked,
    villasInSchedule: byVilla.size, villasMatched: villas.filter(villa => villa.inProject).length,
    missingInProject: villas.filter(villa => !villa.inProject).map(villa => villa.unitNumber),
    withoutActivities: input.villas.map(villa => villa.unitNumber).filter(number => !named.has(number)).sort((a, b) => a - b),
    mismatches, villas,
  };
}
