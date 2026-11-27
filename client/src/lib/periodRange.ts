// Q-72 (2): the periods «achievement of the period» offers — a week starts on Sunday, days are the site's (the caller passes today's date as YYYY-MM-DD). Pure.
export type PeriodKind = "none" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom";
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const format = (date: Date) => date.toISOString().slice(0, 10);
const shift = (iso: string, days: number) => format(new Date(parse(iso).getTime() + days * 86_400_000));

/** The Sunday on or before `iso`. */
export const weekStart = (iso: string) => shift(iso, -parse(iso).getUTCDay());

export function periodFor(kind: Exclude<PeriodKind, "none" | "custom">, today: string): { from: string; to: string } {
  if (kind === "thisWeek") return { from: weekStart(today), to: today };
  if (kind === "lastWeek") { const start = shift(weekStart(today), -7); return { from: start, to: shift(start, 6) }; }
  const first = `${today.slice(0, 7)}-01`;
  if (kind === "thisMonth") return { from: first, to: today };
  const lastDay = shift(first, -1);
  return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
}

/** Today on site (UTC+3) as YYYY-MM-DD. */
export const siteToday = (now = new Date()) => new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
