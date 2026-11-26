// Q-61 (4): the planned progress of each villa, month by month, from the P6 baseline and the weights — no monthly dates asked of the owner. For a villa and a
// month's end t, the planned cumulative percentage is the sum over the weight groups of (the group's weight for the villa's model × how much of the group has
// elapsed by t), where «elapsed» follows the group's link (Q-61 (3)):
//   span  — linear over the villa's activities in the linked stages: Σ elapsed duration ÷ Σ duration (an activity with no duration counts at its finish);
//   start — 1 from the earliest start of the stage's activities in the villa, else 0;  end — 1 from the latest finish, else 0.
// A group whose stages have no activity in a villa is named for that villa (it would otherwise be silently 0). The block, model and project curves are the
// villas' curves averaged by unit weight; each villa's planned percentage today is computed the same way at `at`. Pure: the caller loads the baseline's
// dates and checks that every weighted group is linked.

export type CurveVilla = { unitNumber: number; modelCode: string; blockCode: string; unitWeight: number };
export type CurveActivity = { villa: number; stage: string; start: Date; finish: Date };
export type CurveGroup = { id: string; code: string; weightByModel: Record<string, number> };
export type CurveLink = { groupId: string; stageCodes: string[]; anchor: "span" | "start" | "end" };
export type CurvePoint = { month: string; planned: number };

/** The last instant of each calendar month (UTC) from the month of `from` to the month of `to`, as «YYYY-MM» with its end. */
export function monthEnds(from: Date, to: Date): Array<{ month: string; end: Date }> {
  const out: Array<{ month: string; end: Date }> = [];
  let year = from.getUTCFullYear(); let month = from.getUTCMonth();
  const lastYear = to.getUTCFullYear(); const lastMonth = to.getUTCMonth();
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    out.push({ month: `${year}-${String(month + 1).padStart(2, "0")}`, end: new Date(Date.UTC(year, month + 1, 1) - 1) });
    month += 1; if (month === 12) { month = 0; year += 1; }
    if (out.length > 600) break; // fifty years: a guard against a broken date, not a limit any schedule reaches
  }
  return out;
}

/** 0..1: how much of these activities has elapsed by t under the anchor. */
export function elapsedShare(activities: CurveActivity[], anchor: CurveLink["anchor"], t: Date): number {
  if (!activities.length) return 0;
  const now = t.getTime();
  if (anchor === "start") return now >= Math.min(...activities.map(a => a.start.getTime())) ? 1 : 0;
  if (anchor === "end") return now >= Math.max(...activities.map(a => a.finish.getTime())) ? 1 : 0;
  let total = 0; let done = 0; let instantTotal = 0; let instantDone = 0;
  for (const a of activities) {
    const duration = Math.max(0, a.finish.getTime() - a.start.getTime());
    if (duration === 0) { instantTotal += 1; if (now >= a.finish.getTime()) instantDone += 1; continue; }
    total += duration; done += Math.min(duration, Math.max(0, now - a.start.getTime()));
  }
  if (total === 0) return instantDone / instantTotal;
  // activities with no duration add nothing to a span that has length: they are milestones inside it
  return done / total;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function plannedCurves(input: { villas: CurveVilla[]; activities: CurveActivity[]; groups: CurveGroup[]; links: CurveLink[]; at: Date }) {
  const linkOf = new Map(input.links.map(link => [link.groupId, link]));
  const byVillaStage = new Map<string, CurveActivity[]>();
  for (const a of input.activities) { const key = `${a.villa}|${a.stage}`; (byVillaStage.get(key) ?? byVillaStage.set(key, []).get(key)!).push(a); }
  const inProject = new Set(input.villas.map(villa => villa.unitNumber));
  const scheduled = input.activities.filter(a => inProject.has(a.villa));
  if (!scheduled.length) return { months: [] as string[], villas: [], blocks: [], models: [], project: [] as CurvePoint[], projectNow: 0, gaps: [] as Array<{ unitNumber: number; groupCodes: string[] }> };
  const months = monthEnds(new Date(Math.min(...scheduled.map(a => a.start.getTime()))), new Date(Math.max(...scheduled.map(a => a.finish.getTime()))));

  const gaps: Array<{ unitNumber: number; groupCodes: string[] }> = [];
  const villas = input.villas.map(villa => {
    const parts = input.groups.flatMap(group => {
      const weight = group.weightByModel[villa.modelCode] ?? 0;
      const link = linkOf.get(group.id);
      if (weight <= 0 || !link) return [];
      const acts = link.stageCodes.flatMap(code => byVillaStage.get(`${villa.unitNumber}|${code}`) ?? []);
      return [{ group, weight, link, acts }];
    });
    const missing = parts.filter(part => !part.acts.length).map(part => part.group.code);
    if (missing.length && parts.some(part => part.acts.length)) gaps.push({ unitNumber: villa.unitNumber, groupCodes: missing });
    const scheduledHere = parts.some(part => part.acts.length);
    const curve = months.map(({ month, end }) => ({ month, planned: scheduledHere ? round(parts.reduce((sum, part) => sum + part.weight * elapsedShare(part.acts, part.link.anchor, end), 0)) : 0 }));
    const plannedNow = scheduledHere ? round(parts.reduce((sum, part) => sum + part.weight * elapsedShare(part.acts, part.link.anchor, input.at), 0)) : 0;
    return { ...villa, scheduled: scheduledHere, curve, plannedNow };
  });

  const average = (rows: typeof villas): CurvePoint[] => {
    const counted = rows.filter(row => row.scheduled);
    const weight = counted.reduce((sum, row) => sum + row.unitWeight, 0);
    return months.map(({ month }, i) => ({ month, planned: weight ? round(counted.reduce((sum, row) => sum + row.unitWeight * row.curve[i].planned, 0) / weight) : 0 }));
  };
  const groupBy = (key: (row: (typeof villas)[number]) => string) => Array.from(new Set(villas.map(key))).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).map(value => ({ key: value, curve: average(villas.filter(row => key(row) === value)) }));
  const counted = villas.filter(row => row.scheduled); const totalWeight = counted.reduce((sum, row) => sum + row.unitWeight, 0);
  const projectNow = totalWeight ? round(counted.reduce((sum, row) => sum + row.unitWeight * row.plannedNow, 0) / totalWeight) : 0;
  return { months: months.map(m => m.month), villas, blocks: groupBy(row => row.blockCode), models: groupBy(row => row.modelCode), project: average(villas), projectNow, gaps };
}

