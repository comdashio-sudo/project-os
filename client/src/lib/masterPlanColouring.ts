// Q-8 (b): colouring the master-plan drawing by a PMC activity's site status. A plan unit and a PMC villa are matched by the number in the unit's code
// (V-04, V0004, B1-U-0004 → villa 4): the plan and the PMC table have no stored link, so the number is the rule, stated on the screen; a code with no
// number, or a number with no villa, is «not matched» and shown as such, never guessed. Colours are the theme's tokens (so the key reads in dark mode).
export type SiteStatus = "NOT_STARTED" | "IN_PROGRESS" | "UNDER_REVIEW" | "COMPLETE" | "RECEIVED" | "NOT_RECEIVED";
export type SiteUnit = { unitNumber: number; modelCode: string; blockCode: string; status: SiteStatus | null };
export type ColourKey = SiteStatus | "NOT_IN_MODEL" | "NOT_MATCHED";

export const SITE_COLOUR: Record<ColourKey, string> = {
  NOT_STARTED: "var(--muted-foreground)",
  IN_PROGRESS: "var(--warning)",
  UNDER_REVIEW: "var(--info)",
  COMPLETE: "var(--success)",
  // Q-5's QC receipt, kept apart from the site's status
  RECEIVED: "var(--success)",
  NOT_RECEIVED: "var(--destructive)",
  NOT_IN_MODEL: "var(--border)",
  NOT_MATCHED: "var(--background)",
};
export const KEY_ORDER: ColourKey[] = ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE", "RECEIVED", "NOT_RECEIVED", "NOT_IN_MODEL", "NOT_MATCHED"];
export const SITE_KEYS: ColourKey[] = ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE", "NOT_IN_MODEL", "NOT_MATCHED"];
export const QC_KEYS: ColourKey[] = ["RECEIVED", "NOT_RECEIVED", "NOT_IN_MODEL", "NOT_MATCHED"];

/** The villa number in a plan unit's code: its last run of digits. */
export function unitNumberOf(code: string): number | null {
  const runs = code.match(/\d+/g);
  if (!runs) return null;
  const n = Number(runs[runs.length - 1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export type Colouring = { keyOf: (code: string) => ColourKey; villaOf: (code: string) => SiteUnit | null; counts: Record<ColourKey, number> };

/** The colour key of each plan unit, and the count per key over the given plan units (the ones linked on the drawing). */
export function colourUnits(planCodes: string[], villas: SiteUnit[]): Colouring {
  const byNumber = new Map(villas.map(villa => [villa.unitNumber, villa]));
  const villaOf = (code: string) => { const n = unitNumberOf(code); return n === null ? null : byNumber.get(n) ?? null; };
  const keyOf = (code: string): ColourKey => { const villa = villaOf(code); return !villa ? "NOT_MATCHED" : villa.status ?? "NOT_IN_MODEL"; };
  const counts = Object.fromEntries(KEY_ORDER.map(key => [key, 0])) as Record<ColourKey, number>;
  for (const code of planCodes) counts[keyOf(code)] += 1;
  return { keyOf, villaOf, counts };
}

/** Whether a plan unit passes the block and model filters (an empty filter passes everything; a unit with no villa passes only empty filters). */
export function passesFilter(villa: SiteUnit | null, block: string, model: string): boolean {
  if (!block && !model) return true;
  if (!villa) return false;
  return (!block || villa.blockCode === block) && (!model || villa.modelCode === model);
}
