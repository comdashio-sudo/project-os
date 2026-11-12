import React from "react";
import { CheckCircle2, ClipboardPaste, Plus, Trash2, XCircle } from "lucide-react";
import { Button, TableScroll } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { fieldMessage } from "@/lib/formValidation";
import { pickLanguage, type Language } from "@/lib/language";

// Work order 21: a sheet for entering many rows at once, the way people already keep them in Excel. Paste a block copied from Excel (rows on
// lines, cells separated by tabs) into any cell and it fills from there, adding rows as needed. Every row is checked on its own before anything is
// sent (required, number, minimum, and the screen's own rule), and the result of each row is shown on that row: saved, or why not. Rows that are
// entirely empty are ignored. The screen decides what "save a row" means (it calls the same procedure its one-row form calls).
export type GridColumn = { key: string; label: string; kind?: "text" | "number"; required?: boolean; min?: number; max?: number; minLength?: number; width?: string; dir?: "ltr" | "rtl" };
export type GridRow = Record<string, string>;
type RowState = { status: "idle" | "invalid" | "saving" | "saved" | "failed"; message?: string };

const copy = {
  ar: { add: "إضافة صف", paste: "الصق من Excel في أي خانة: كل سطر صف، والخانات مفصولة بعلامة جدولة.", save: "حفظ الصفوف", saving: "جارٍ الحفظ…", remove: "حذف الصف", clearSaved: "إزالة المحفوظ", row: "الصف", result: "النتيجة", saved: "حُفظ", summary: (ok: number, bad: number) => `حُفظ ${ok}، ولم يُحفظ ${bad}.`, nothing: "لا صفوف لحفظها." },
  en: { add: "Add row", paste: "Paste from Excel into any cell: each line is a row, cells separated by tabs.", save: "Save rows", saving: "Saving…", remove: "Remove the row", clearSaved: "Remove saved rows", row: "Row", result: "Result", saved: "Saved", summary: (ok: number, bad: number) => `${ok} saved, ${bad} not saved.`, nothing: "No rows to save." },
  ur: { add: "قطار شامل کریں", paste: "Excel سے کسی بھی خانے میں پیسٹ کریں: ہر سطر ایک قطار، خانے ٹیب سے الگ۔", save: "قطاریں محفوظ کریں", saving: "محفوظ ہو رہا ہے…", remove: "قطار ہٹائیں", clearSaved: "محفوظ شدہ ہٹائیں", row: "قطار", result: "نتیجہ", saved: "محفوظ ہو گئی", summary: (ok: number, bad: number) => `${ok} محفوظ، ${bad} محفوظ نہیں ہوئیں۔`, nothing: "محفوظ کرنے کو کوئی قطار نہیں۔" },
};

/** Tab-separated lines (what Excel puts on the clipboard) as a matrix of trimmed cells; a trailing empty line is dropped. */
export function parseClipboardGrid(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.map(line => line.split("\t").map(cell => cell.trim()));
}

/** The first problem of one row, in the person's language, or null. Western digits only: "1,250.50" is read as 1250.5. */
export function gridRowProblem(columns: GridColumn[], row: GridRow, language: Language, extra?: (row: GridRow) => string | null): string | null {
  for (const column of columns) {
    const value = (row[column.key] ?? "").trim();
    if (!value) { if (column.required) return `${column.label}: ${fieldMessage("PROJECT_OS_FIELD_REQUIRED", language)}`; continue; }
    if (column.minLength && value.length < column.minLength) return `${column.label}: ${fieldMessage("PROJECT_OS_FIELD_TOO_SHORT", language)}`;
    if (column.kind === "number") {
      // review of #254: a comma is a thousands separator only in its places ("1,250.5"); "1,5" is refused, not read as 15
      if (value.includes(",") && !/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(value)) return `${column.label}: ${fieldMessage("PROJECT_OS_FIELD_NUMBER_INVALID", language)}`;
      const number = Number(value.replace(/,/g, ""));
      if (!Number.isFinite(number)) return `${column.label}: ${fieldMessage("PROJECT_OS_FIELD_NUMBER_INVALID", language)}`;
      if ((column.min !== undefined && number < column.min) || (column.max !== undefined && number > column.max)) return `${column.label}: ${fieldMessage("PROJECT_OS_FIELD_OUT_OF_RANGE", language)}`;
    }
  }
  return extra?.(row) ?? null;
}

/** The number a cell holds, with grouping commas removed. */
export const gridNumber = (value: string | undefined) => Number((value ?? "").trim().replace(/,/g, ""));

const empty = (columns: GridColumn[]): GridRow => Object.fromEntries(columns.map(column => [column.key, ""]));
const isBlank = (row: GridRow) => Object.values(row).every(value => !value.trim());

export function GridEditor({ label, columns, onSaveRow, onSaved, validateRow, initialRows = 3, disabled }: {
  label: string; columns: GridColumn[]; onSaveRow: (row: GridRow) => Promise<void>; validateRow?: (row: GridRow) => string | null; initialRows?: number; disabled?: boolean;
  /** Called once after the whole sheet is saved, when at least one row was (review of #254: the screen refreshes once, not once per row). */
  onSaved?: () => void;
}) {
  const { language } = useLanguage();
  const t = pickLanguage(language, copy);
  const [rows, setRows] = React.useState<GridRow[]>(() => Array.from({ length: initialRows }, () => empty(columns)));
  const [states, setStates] = React.useState<RowState[]>(() => Array.from({ length: initialRows }, () => ({ status: "idle" as const })));
  const [busy, setBusy] = React.useState(false);
  const [summary, setSummary] = React.useState<string | null>(null);

  const setCell = (rowIndex: number, key: string, value: string) => {
    setRows(current => current.map((row, index) => (index === rowIndex ? { ...row, [key]: value } : row)));
    setStates(current => current.map((state, index) => (index === rowIndex && state.status !== "saved" ? { status: "idle" } : state)));
  };
  const paste = (rowIndex: number, columnIndex: number) => (event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return; // one value: the browser pastes it into this cell as usual
    event.preventDefault();
    const block = parseClipboardGrid(text);
    setRows(current => {
      const next = current.map(row => ({ ...row }));
      block.forEach((cells, offset) => {
        const target = rowIndex + offset;
        while (next.length <= target) next.push(empty(columns));
        cells.forEach((cell, cellOffset) => { const column = columns[columnIndex + cellOffset]; if (column) next[target][column.key] = cell; });
      });
      return next;
    });
    setStates(current => { const next = [...current]; while (next.length < rowIndex + block.length) next.push({ status: "idle" }); return next.map((state, index) => (index >= rowIndex && index < rowIndex + block.length && state.status !== "saved" ? { status: "idle" } : state)); });
  };
  const addRow = () => { setRows(current => [...current, empty(columns)]); setStates(current => [...current, { status: "idle" }]); };
  const removeRow = (rowIndex: number) => { setRows(current => current.filter((_, index) => index !== rowIndex)); setStates(current => current.filter((_, index) => index !== rowIndex)); };
  const clearSaved = () => { const keep = states.map(state => state.status !== "saved"); setRows(current => current.filter((_, index) => keep[index])); setStates(current => current.filter((_, index) => keep[index])); };

  const save = async () => {
    // every row is checked first; nothing is sent while a row is wrong, so a half-saved sheet cannot come from a typo on row 9
    const checked = rows.map((row, index) => (states[index]?.status === "saved" || isBlank(row) ? null : gridRowProblem(columns, row, language, validateRow)));
    const pending = rows.map((row, index) => states[index]?.status !== "saved" && !isBlank(row));
    if (!pending.some(Boolean)) { setSummary(t.nothing); return; }
    if (checked.some(Boolean)) {
      setStates(current => current.map((state, index) => (checked[index] ? { status: "invalid", message: checked[index]! } : state)));
      setSummary(null);
      return;
    }
    setBusy(true);
    let ok = 0; let bad = 0;
    for (let index = 0; index < rows.length; index += 1) {
      if (!pending[index]) continue;
      setStates(current => current.map((state, i) => (i === index ? { status: "saving" } : state)));
      try {
        await onSaveRow(rows[index]);
        ok += 1;
        setStates(current => current.map((state, i) => (i === index ? { status: "saved" } : state)));
      } catch (error) {
        bad += 1;
        const message = error instanceof Error ? error.message : String(error);
        setStates(current => current.map((state, i) => (i === index ? { status: "failed", message } : state)));
      }
    }
    setBusy(false);
    setSummary(t.summary(ok, bad));
    if (ok > 0) onSaved?.();
  };

  return (
    <div className="flex flex-col gap-3" data-grid-editor>
      <p className="flex items-start gap-2 text-xs text-muted-foreground"><ClipboardPaste className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t.paste}</p>
      {/* review of #254: the sheet says when it scrolls sideways (hint and edge fade) and keeps the row number in place; the rows not saved are named again under it */}
      <TableScroll label={label} className="rounded-[var(--radius)] border border-border">
        <table className="w-full min-w-[560px] text-sm" aria-label={label}>
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr><th scope="col" className="w-12 px-2 py-2 text-start">{t.row}</th>{columns.map(column => <th key={column.key} scope="col" className="px-2 py-2 text-start" style={column.width ? { width: column.width } : undefined}>{column.label}{column.required ? <span className="ms-0.5 text-destructive" aria-hidden="true">*</span> : null}</th>)}<th scope="col" className="px-2 py-2 text-start">{t.result}</th><th scope="col" className="w-10"><span className="sr-only">{t.remove}</span></th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, rowIndex) => {
              const state = states[rowIndex] ?? { status: "idle" as const };
              const locked = state.status === "saved" || state.status === "saving" || disabled;
              return (
                <tr key={rowIndex} data-row-state={state.status} className={state.status === "invalid" || state.status === "failed" ? "bg-danger-soft/40" : state.status === "saved" ? "bg-success-soft/40" : undefined}>
                  <td className="px-2 py-1 text-xs text-muted-foreground tabular-nums">{rowIndex + 1}</td>
                  {columns.map((column, columnIndex) => (
                    <td key={column.key} className="px-1 py-1">
                      <input aria-label={`${column.label} (${t.row} ${rowIndex + 1})`} value={row[column.key] ?? ""} disabled={locked} dir={column.dir ?? (column.kind === "number" ? "ltr" : undefined)} inputMode={column.kind === "number" ? "decimal" : undefined}
                        aria-invalid={state.status === "invalid" || undefined} onChange={event => setCell(rowIndex, column.key, event.target.value)} onPaste={paste(rowIndex, columnIndex)}
                        className="min-h-11 w-full rounded-[calc(var(--radius)-2px)] border border-input bg-card px-2 md:min-h-10 text-sm text-foreground aria-[invalid=true]:border-destructive disabled:opacity-70" />
                    </td>
                  ))}
                  <td className="px-2 py-1 text-xs" aria-live="polite">
                    {state.status === "saved" ? <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{t.saved}</span> : null}
                    {state.status === "invalid" || state.status === "failed" ? <span className="flex items-start gap-1 text-destructive"><XCircle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />{state.message}</span> : null}
                  </td>
                  <td className="px-1 py-1">{state.status === "saved" ? null : <button type="button" aria-label={`${t.remove} ${rowIndex + 1}`} disabled={busy || disabled} onClick={() => removeRow(rowIndex)} className="grid h-11 w-11 place-items-center rounded-[var(--radius)] text-muted-foreground hover:bg-muted disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      {/* D-74 (b): the rows that were not saved are named again under the sheet, so the reason is read even where the sheet scrolls sideways (a phone, a half-width card) */}
      {states.some(state => state.status === "invalid" || state.status === "failed") ? (
        <ul role="alert" data-grid-problems className="space-y-1 rounded-[var(--radius)] bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
          {states.map((state, index) => (state.status === "invalid" || state.status === "failed" ? <li key={index}>{t.row} {index + 1}: {state.message}</li> : null))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="md" icon={<Plus className="h-4 w-4" aria-hidden="true" />} disabled={busy || disabled} onClick={addRow}>{t.add}</Button>
        <Button size="md" loading={busy} disabled={disabled} onClick={() => void save()}>{busy ? t.saving : t.save}</Button>
        {states.some(state => state.status === "saved") ? <Button variant="ghost" size="md" disabled={busy} onClick={clearSaved}>{t.clearSaved}</Button> : null}
        {summary ? <p role="status" className="text-sm text-muted-foreground">{summary}</p> : null}
      </div>
    </div>
  );
}
