// Q-57 (4): the period export of the daily reports. Shared by the server's list read and the screen that asks for it, so the cap is written once.
/** The most reports a period export holds. The server reads one more than this, so «more than the cap» is known exactly and a period of exactly the cap is accepted. */
export const REPORT_RANGE_CAP = 400;

/** A real calendar day written YYYY-MM-DD («2026-02-31» is not one). */
export function isCalendarDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
