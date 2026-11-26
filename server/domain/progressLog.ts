// Q-70 (1): «the progress log» — one row per entry a person made, not one per villa. A save of 4 villas in the progress update writes 4 history rows with the
// same note («batch <id>»); the import writes one per cell with the note «import»; a daily report «Daily report <date>»; an undo «undo <id>»; a single cell
// edit has no note. QC receipts are their own events (with a batch id). Here those rows are folded back into the entries the person made: same source and
// note, same activity, same before → after, same person (and, for an import or a daily report, the same day). Pure: the caller reads the rows.
import { riyadhDay } from "./stalledUnits";

export type LogSource = "manual" | "import" | "dailyReport" | "undo" | "cell" | "qc";
export const LOG_SOURCES: readonly LogSource[] = ["manual", "import", "dailyReport", "undo", "cell", "qc"];

export type LogRow = {
  id: string; at: Date; note: string | null; qcBatchId?: string | null; isQc?: boolean;
  activityCode: string; activityName: string; from: string | null; to: string;
  byUserId: number | null; byName: string | null; villa: string; blockCode: string;
};
export type LogEntry = {
  key: string; at: Date; day: string; source: LogSource; activityCode: string; activityName: string; from: string | null; to: string;
  byUserId: number | null; byName: string | null; villas: string[]; blocks: string[];
};

export function sourceOf(row: Pick<LogRow, "note" | "isQc">): LogSource {
  if (row.isQc) return "qc";
  const note = row.note?.trim() ?? "";
  if (!note) return "cell";
  if (/^batch\s/i.test(note)) return "manual";
  if (/^undo\s/i.test(note)) return "undo";
  if (/^import$/i.test(note)) return "import";
  if (/^daily report\b/i.test(note)) return "dailyReport";
  return "cell"; // a note written by hand on one cell
}

const byNumber = (a: string, b: string) => (Number(a) - Number(b)) || a.localeCompare(b);

/** The entries, newest first; villas in each entry by number. */
export function groupProgressLog(rows: LogRow[]): LogEntry[] {
  const entries = new Map<string, LogEntry>();
  for (const row of rows) {
    const source = sourceOf(row); const day = riyadhDay(row.at);
    const who = `${row.byUserId ?? ""}|${row.activityCode}|${row.from ?? ""}|${row.to}`;
    const key = source === "cell" ? `cell|${row.id}`
      : source === "qc" ? (row.qcBatchId ? `qc|${row.qcBatchId}|${who}` : `qc|${row.id}`)
      : source === "manual" || source === "undo" ? `${row.note}|${who}`
      : `${source}|${row.note}|${day}|${who}`;
    const entry = entries.get(key);
    if (!entry) entries.set(key, { key, at: row.at, day, source, activityCode: row.activityCode, activityName: row.activityName, from: row.from, to: row.to, byUserId: row.byUserId, byName: row.byName, villas: [row.villa], blocks: row.blockCode ? [row.blockCode] : [] });
    else {
      if (row.at > entry.at) { entry.at = row.at; entry.day = day; }
      if (!entry.villas.includes(row.villa)) entry.villas.push(row.villa);
      if (row.blockCode && !entry.blocks.includes(row.blockCode)) entry.blocks.push(row.blockCode);
    }
  }
  const out = Array.from(entries.values());
  for (const entry of out) { entry.villas.sort(byNumber); entry.blocks.sort(); }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime() || a.key.localeCompare(b.key));
}
