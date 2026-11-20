// Q-50 batch 5b: a weights file with no section column, numbered as a hierarchy instead — «1 / 1.2 / 1.2.3», or a code with a prefix such as
// «WIR.2.1.1». A numbered row that other numbered rows sit under is a heading: the top one names the group, the deepest one above an activity names its
// stage. Headings are not activities (never imported, counted in the report). A numbered activity with no heading above it keeps an empty group and is
// refused on its own row by the catalogue's rules (PMC_CLASSIFICATION_BLANK) — never placed in a group by guess.

type Cells = Record<string, unknown>;
type Row = { rowNumber: number; cells: Cells };

const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

/** «1.2.3» → [1, 2, 3]; «WIR.2.1» → [2, 1]; «١٫٢» → [1, 2]; anything else (a name, a date, «1-2») → null. */
export function outlineSegments(value: unknown): number[] | null {
  const text = String(value ?? "").trim()
    .replace(EASTERN_DIGITS, digit => String((digit.charCodeAt(0) - (digit.charCodeAt(0) >= 0x06f0 ? 0x06f0 : 0x0660))))
    .replace(/٫/g, ".");
  const match = /^(?:[A-Za-z]{1,8}[.\- ]?)?(\d{1,4}(?:\.\d{1,4}){0,7})\.?$/.exec(text);
  return match ? match[1].split(".").map(Number) : null;
}

export type OutlineResult = { headings: number; placed: number };

/**
 * Fills `csi` (group) and `sub` (stage) of each numbered activity from the headings above it, in place, and removes the heading rows from `rows`.
 * `numberOf` reads a row's number (the numbering column, or the activity code). A cell the file already filled is never overwritten.
 */
export function applyOutline(rows: Row[], numberOf: (cells: Cells) => unknown): OutlineResult {
  const keys = rows.map(row => outlineSegments(numberOf(row.cells))?.join(".") ?? null);
  const numbered = new Set(keys.filter((key): key is string => key !== null));
  const hasChildren = (key: string) => { for (const other of Array.from(numbered)) if (other.startsWith(`${key}.`)) return true; return false; };
  const stack: Array<{ key: string; label: string }> = [];
  const kept: Row[] = [];
  let headings = 0;
  let placed = 0;
  rows.forEach((row, index) => {
    const key = keys[index];
    if (key === null) { kept.push(row); return; }
    while (stack.length && !key.startsWith(`${stack[stack.length - 1].key}.`)) stack.pop();
    if (hasChildren(key)) {
      const name = String(row.cells.activityName ?? "").trim();
      stack.push({ key, label: name ? `${key} ${name}` : key });
      headings += 1;
      return;
    }
    if (stack.length) {
      if (!String(row.cells.csi ?? "").trim()) row.cells.csi = stack[0].label;
      if (stack.length > 1 && !String(row.cells.sub ?? "").trim()) row.cells.sub = stack[stack.length - 1].label;
      placed += 1;
    }
    kept.push(row);
  });
  rows.splice(0, rows.length, ...kept);
  return { headings, placed };
}
