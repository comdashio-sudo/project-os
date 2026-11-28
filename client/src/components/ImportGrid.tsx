import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ds/Select";
import { mappingOf, type ColumnReport } from "@/components/ColumnMapping";
import { correctionsOf, type AppliedEdit, type AppliedReplace, type ReplaceRule } from "@/components/PmcRowCorrections";
import { PMC_FIELD_LABELS, pmcImportReason } from "@/lib/pmcImportMessages";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { pickLanguage, type Language } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import type { inferRouterOutputs } from "@trpc/server";
import { CheckCircle2, Download, Search, XCircle } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

// Q-66 batch 1 (the owner, 26-11: «when importing, the files should show like an Excel table, clearer than one row at a time, after processing, to confirm it»;
// adviser's I68): the file as the importer read it, in a grid like Excel — the header and the row numbers stay in place, every row of the file can be
// scrolled to (a page is fetched as the end comes near, and only the rows in view are drawn), and each cell says what the reader did to it:
//   yellow — corrected by the reader or by you (the file's value and the reason on hover and for screen readers)
//   red    — a reason that stops the row
//   grey and struck through — a row the reader did not read (a totals line, a row you left out), with why
// A cell is corrected in place (double click, or Enter on it): the corrections are sent together and the file is analysed again — nothing is written before
// the report is confirmed. A column's source is changed from its header: the file is read again with those columns. Reads only the import's own grid.
type Grid = inferRouterOutputs<AppRouter>["dataImports"]["grid"];
type GridRow = Grid["rows"][number];
type Tab = Grid["tab"];
export type ImportGridCheck = { label: string; ok: boolean; detail?: string };

const text = {
  ar: {
    sheets: "أوراق الملف", sheetRead: "مقروءة", list: (items: string[]) => items.join("، "),
    sheetWhy: { complete: (name: string, row?: number) => `قُرئت ورقة «${name}»: رأسها في الصف ${row} يسمّي كل الأعمدة المطلوبة.`, closest: (name: string, row?: number) => `قُرئت ورقة «${name}»: لا ورقة تسمّي كل الأعمدة المطلوبة، وهذه أقربها (رأسها في الصف ${row}).`, wide: (name: string) => `قُرئت ورقة «${name}»: جدول أوزان فيه عمود لكل نموذج.`,
      missing: (name: string, _row?: number, missing?: string) => missing ? `لم تُقرأ ورقة «${name}»: ينقصها ${missing}.` : `لم تُقرأ ورقة «${name}»: لا تسمّي الأعمدة المطلوبة.`, ambiguous: (name: string) => `لم تُقرأ ورقة «${name}»: فيها كل الأعمدة المطلوبة مثل ورقة أخرى، فلا يُختار أيٌّ منهما قبل أن تبقي واحدة.`,
      hidden: (name: string) => `لم تُقرأ ورقة «${name}»: مخفية في الملف.`, notRead: (name: string) => `لم تُقرأ ورقة «${name}»: قُرئ جدول الأوزان من ورقة أخرى.` },
    title: "الملف بعد المعالجة", hint: "هكذا قرأ النظام ملفك. انقر مرتين على خلية لتصحيحها؛ لا يُحفظ شيء قبل تأكيدك.", row: "الصف",
    tabs: { all: "الكل", ready: "جاهز", corrected: "صُحّح", errors: "أخطاء", ignored: "متجاهَل" } as Record<Tab, string>, search: "ابحث في الجدول",
    why: { edited: "صحّحته أنت", replaced: "صحّحت كل خلية مثلها في هذا العمود", filledDown: "أُخذ من الصف أعلاه (القسم مكتوب مرة واحدة فوق بنوده)", fraction: "كسر في الملف قُرئ نسبة مئوية" } as Record<string, string>,
    inFile: "في الملف", empty: "فارغ", ignoredTotal: "سطر مجموع: لا يُقرأ", ignoredLeftOut: "تركته أنت: لا يُقرأ", unused: "أعمدة في ملفك لن تُستورد",
    source: (field: string) => `عمود «${field}» في ملفك`, notRead: "لا يُقرأ", remap: "أعد القراءة بهذه الأعمدة", remapNote: "قراءة الملف بأعمدة أخرى تُسقط تصحيحات الخلايا.",
    edits: (count: number) => `${count} تصحيح لم يُحلَّل بعد`, offer: (to: string, from: string, field: string) => `طبّق «${to}» على كل خلية «${from}» في عمود ${field}`, notNow: "هذه الخلية فقط", applyAll: "طبّق على كل خلية مثلها",
    rules: "كل خلية مثلها", rule: (from: string, to: string, field: string) => `${field}: كل «${from}» ← «${to}»`, cells: (count: number) => `${count} خلية`, undo: "تراجع", undone: "سيُلغى", apply: "أعد التحليل بهذه التصحيحات", discard: "تراجع عنها", editLabel: (field: string, row: number) => `${field} · الصف ${row}`,
    ready: (count: number) => `${count} صف جاهز`, rejected: (count: number) => `${count} صف مرفوض`, checks: "مجاميع التحقق", noRows: "لا صفوف في هذا التبويب.", loading: "جارٍ تحميل الصفوف…", failed: "تعذّر تحميل الجدول",
    shown: (shown: number, total: number) => `${shown} من ${total}`, download: "نزّل النسخة المنظّفة (Excel)", downloading: "جارٍ تجهيز الملف…", downloadHint: "بالألوان نفسها وعمود ملاحظات، لترسله لمن عبّأ الملف.",
  },
  en: {
    sheets: "Sheets of the file", sheetRead: "read", list: (items: string[]) => items.join(", "),
    sheetWhy: { complete: (name: string, row?: number) => `Sheet «${name}» was read: its header on row ${row} names every required column.`, closest: (name: string, row?: number) => `Sheet «${name}» was read: no sheet names every required column, and this one is the closest (header on row ${row}).`, wide: (name: string) => `Sheet «${name}» was read: a weights table with a column per model.`,
      missing: (name: string, _row?: number, missing?: string) => missing ? `Sheet «${name}» was not read: it lacks ${missing}.` : `Sheet «${name}» was not read: it does not name the required columns.`, ambiguous: (name: string) => `Sheet «${name}» was not read: it holds every required column like another sheet, so neither is chosen until you keep one.`,
      hidden: (name: string) => `Sheet «${name}» was not read: it is hidden in the file.`, notRead: (name: string) => `Sheet «${name}» was not read: the weights table was read from another sheet.` },
    title: "The file after processing", hint: "This is how the platform read your file. Double-click a cell to correct it; nothing is saved before you confirm.", row: "Row",
    tabs: { all: "All", ready: "Ready", corrected: "Corrected", errors: "Errors", ignored: "Ignored" } as Record<Tab, string>, search: "Search the table",
    why: { edited: "You corrected it", replaced: "You corrected every cell like it in this column", filledDown: "Taken from the row above (the section is written once above its items)", fraction: "A fraction in the file read as a percent" } as Record<string, string>,
    inFile: "In the file", empty: "empty", ignoredTotal: "Totals line: not read", ignoredLeftOut: "You left it out: not read", unused: "Columns of your file that will not be imported",
    source: (field: string) => `Column for «${field}» in your file`, notRead: "Not read", remap: "Read again with these columns", remapNote: "Reading the file with other columns drops the cell corrections.",
    edits: (count: number) => `${count} correction(s) not analysed yet`, offer: (to: string, from: string, field: string) => `Apply «${to}» to every «${from}» in the ${field} column`, notNow: "This cell only", applyAll: "Apply to every cell like it",
    rules: "Every cell like it", rule: (from: string, to: string, field: string) => `${field}: every «${from}» → «${to}»`, cells: (count: number) => `${count} cell(s)`, undo: "Undo", undone: "Will be removed", apply: "Analyse again with these corrections", discard: "Discard them", editLabel: (field: string, row: number) => `${field} · row ${row}`,
    ready: (count: number) => `${count} rows ready`, rejected: (count: number) => `${count} rows rejected`, checks: "Totals checks", noRows: "No rows in this tab.", loading: "Loading rows…", failed: "The table could not be loaded",
    shown: (shown: number, total: number) => `${shown} of ${total}`, download: "Download the cleaned copy (Excel)", downloading: "Preparing the file…", downloadHint: "In the same colours with a notes column, to send to whoever filled in the file.",
  },
  ur: {
    sheets: "فائل کی شیٹس", sheetRead: "پڑھی گئی", list: (items: string[]) => items.join("، "),
    sheetWhy: { complete: (name: string, row?: number) => `شیٹ «${name}» پڑھی گئی: قطار ${row} میں اس کا ہیڈر ہر لازمی کالم کا نام رکھتا ہے۔`, closest: (name: string, row?: number) => `شیٹ «${name}» پڑھی گئی: کوئی شیٹ ہر لازمی کالم کا نام نہیں رکھتی، اور یہ سب سے قریب ہے (ہیڈر قطار ${row} میں)۔`, wide: (name: string) => `شیٹ «${name}» پڑھی گئی: وزن کا جدول جس میں ہر ماڈل کا ایک کالم ہے۔`,
      missing: (name: string, _row?: number, missing?: string) => missing ? `شیٹ «${name}» نہیں پڑھی گئی: اس میں ${missing} نہیں ہے۔` : `شیٹ «${name}» نہیں پڑھی گئی: یہ لازمی کالموں کے نام نہیں رکھتی۔`, ambiguous: (name: string) => `شیٹ «${name}» نہیں پڑھی گئی: اس میں ایک اور شیٹ کی طرح ہر لازمی کالم ہے، اس لیے جب تک آپ ایک نہ رکھیں کوئی نہیں چنی جاتی۔`,
      hidden: (name: string) => `شیٹ «${name}» نہیں پڑھی گئی: یہ فائل میں چھپی ہوئی ہے۔`, notRead: (name: string) => `شیٹ «${name}» نہیں پڑھی گئی: وزن کا جدول دوسری شیٹ سے پڑھا گیا۔` },
    title: "پروسیسنگ کے بعد فائل", hint: "پلیٹ فارم نے آپ کی فائل ایسے پڑھی۔ کسی خانے کو درست کرنے کے لیے اس پر دو بار کلک کریں؛ آپ کی تصدیق سے پہلے کچھ محفوظ نہیں ہوتا۔", row: "قطار",
    tabs: { all: "سب", ready: "تیار", corrected: "درست کیا گیا", errors: "غلطیاں", ignored: "نظرانداز" } as Record<Tab, string>, search: "جدول میں تلاش کریں",
    why: { edited: "آپ نے درست کیا", replaced: "آپ نے اس کالم میں اس جیسے ہر خانے کو درست کیا", filledDown: "اوپر والی قطار سے لیا گیا (سیکشن اپنی آئٹمز کے اوپر ایک بار لکھا ہے)", fraction: "فائل میں کسر کو فیصد کے طور پر پڑھا گیا" } as Record<string, string>,
    inFile: "فائل میں", empty: "خالی", ignoredTotal: "میزان کی سطر: نہیں پڑھی جاتی", ignoredLeftOut: "آپ نے چھوڑ دی: نہیں پڑھی جاتی", unused: "آپ کی فائل کے کالم جو امپورٹ نہیں ہوں گے",
    source: (field: string) => `آپ کی فائل میں «${field}» کا کالم`, notRead: "نہیں پڑھا جاتا", remap: "ان کالموں کے ساتھ دوبارہ پڑھیں", remapNote: "دوسرے کالموں سے فائل پڑھنے پر خانوں کی درستیاں ختم ہو جاتی ہیں۔",
    edits: (count: number) => `${count} درستیاں جن کا ابھی تجزیہ نہیں ہوا`, offer: (to: string, from: string, field: string) => `${field} کالم میں ہر «${from}» پر «${to}» لاگو کریں`, notNow: "صرف یہ خانہ", applyAll: "اس جیسے ہر خانے پر لاگو کریں",
    rules: "اس جیسا ہر خانہ", rule: (from: string, to: string, field: string) => `${field}: ہر «${from}» ← «${to}»`, cells: (count: number) => `${count} خانے`, undo: "واپس لیں", undone: "ہٹا دیا جائے گا", apply: "ان درستیوں کے ساتھ دوبارہ تجزیہ کریں", discard: "انہیں واپس لیں", editLabel: (field: string, row: number) => `${field} · قطار ${row}`,
    ready: (count: number) => `${count} قطاریں تیار`, rejected: (count: number) => `${count} قطاریں مسترد`, checks: "مجموعوں کی جانچ", noRows: "اس ٹیب میں کوئی قطار نہیں۔", loading: "قطاریں لوڈ ہو رہی ہیں…", failed: "جدول لوڈ نہیں ہو سکی",
    shown: (shown: number, total: number) => `${shown} از ${total}`, download: "صاف شدہ نقل ڈاؤن لوڈ کریں (Excel)", downloading: "فائل تیار ہو رہی ہے…", downloadHint: "انہی رنگوں اور نوٹس کے کالم کے ساتھ، فائل بھرنے والے کو بھیجنے کے لیے۔",
  },
};

const TABS: Tab[] = ["all", "ready", "corrected", "errors", "ignored"];
/** The height of a row, fixed so only the rows in view are drawn; and how many are drawn around them. */
export const GRID_ROW_HEIGHT = 40;
const OVERSCAN = 12;
const VIEWPORT_ROWS = 14;
const NUMERIC = /^[-+]?[\d.,\u0660-\u0669\u066B\u066C]+%?$/;
/** «Not read from any column» in a header's list (mappingOf sends it as an empty header). */
const NOT_READ = "__none";
const cellKey = (row: number, field: string) => `${row}:${field}`;

export function ImportGrid({ tenantId, projectId, importId, columns, applied, ignoredRows, readRows, replaced = [], checks = [], language }: {
  tenantId: string; projectId: string; importId: string;
  /** The columns the analysis read (each field's header can be changed from the grid). */
  columns: ColumnReport;
  /** The corrections the analysis already holds: the next set sent keeps them. */
  applied: AppliedEdit[]; ignoredRows: number[]; readRows: number[];
  /** Q-66 (5b): the «every cell like it» rules the analysis holds, with how many cells each changed. */
  replaced?: AppliedReplace[];
  /** The totals the importer checked (each model's weights = 100%, …), shown with ✅ / ❌ in the summary bar. */
  checks?: ImportGridCheck[]; language: Language;
}) {
  const t = pickLanguage(language, text);
  const labels = pickLanguage<Record<string, string>>(language, PMC_FIELD_LABELS);
  const label = (field: string) => labels[field] ?? field;
  const [tab, setTab] = useState<Tab>("all");
  const [sheetShown, setSheetShown] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const input = { tenantId, projectId, importId, tab, ...(query ? { search: query } : {}) };
  const first = trpc.dataImports.grid.useQuery({ ...input, offset: 0 });
  const utils = trpc.useUtils();
  // the pages after the first, fetched as the end of what is loaded comes into view
  const [more, setMore] = useState<GridRow[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  // a new first page (another tab, a search, a new analysis) starts the list again
  useEffect(() => { setMore([]); }, [first.dataUpdatedAt, tab, query]);
  const rows = useMemo(() => [...(first.data?.rows ?? []), ...more], [first.data, more]);
  const total = first.data?.shownTotal ?? 0;
  const loadMore = () => {
    if (loadingMore || rows.length >= total || !first.data) return;
    setLoadingMore(true);
    void utils.dataImports.grid.fetch({ ...input, offset: rows.length }).then(page => setMore(previous => [...previous, ...page.rows])).finally(() => setLoadingMore(false));
  };
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(VIEWPORT_ROWS * GRID_ROW_HEIGHT);
  useEffect(() => { const element = scroller.current; if (element && element.clientHeight) setHeight(element.clientHeight); }, [first.dataUpdatedAt]);
  const start = Math.max(0, Math.floor(scrollTop / GRID_ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + height) / GRID_ROW_HEIGHT) + OVERSCAN);
  useEffect(() => { if (end >= rows.length - OVERSCAN) loadMore(); });

  // the row a person tapped or moved to: what the reader did to it, said in words under the grid (a touch screen has no hover)
  const [focused, setFocused] = useState<number | null>(null);
  // corrections typed in the grid, sent together with the ones the analysis holds
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ row: number; field: string; value: string } | null>(null);
  // Q-66 (5b): a corrected cell offers its correction for every cell like it in the column — a rule the reader applies, however many cells it reaches
  const [offer, setOffer] = useState<ReplaceRule | null>(null);
  const [rules, setRules] = useState<ReplaceRule[]>([]);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const ruleKey = (rule: { field: string; from: string }) => `${rule.field}\u0000${rule.from.trim()}`;
  const correct = trpc.dataImports.correct.useMutation({ onSuccess: () => { setDrafts({}); setRules([]); setDropped(new Set()); setOffer(null); return Promise.all([utils.dataImports.progress.invalidate(), utils.dataImports.grid.invalidate()]); } });
  const pending = Object.keys(drafts).length + rules.length + dropped.size;
  const ruleSet = () => {
    const byKey = new Map<string, ReplaceRule>();
    for (const rule of replaced) if (!dropped.has(ruleKey(rule))) byKey.set(ruleKey(rule), { field: rule.field, from: rule.from, to: rule.to });
    for (const rule of rules) byKey.set(ruleKey(rule), rule);
    return Array.from(byKey.values());
  };
  const takeOffer = () => {
    if (!offer) return;
    setRules(previous => [...previous.filter(rule => ruleKey(rule) !== ruleKey(offer)), offer]);
    // the cells of that column that read the same are covered by the rule: their own drafts go
    setDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => { const [row, field] = [Number(key.slice(0, key.indexOf(":"))), key.slice(key.indexOf(":") + 1)]; return field !== offer.field || rows.find(item => item.row === row)?.cells[field]?.value !== offer.from; })));
    setOffer(null);
  };
  // a column's source, changed from its header
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries(columns.fields.map(field => [field.key, field.header ?? NOT_READ])));
  const remapped = columns.fields.some(field => (choice[field.key] ?? NOT_READ) !== (field.header ?? NOT_READ));
  const reanalyze = trpc.dataImports.reanalyze.useMutation({ onSuccess: () => Promise.all([utils.dataImports.progress.invalidate(), utils.dataImports.grid.invalidate()]) });
  const fields = first.data?.fields ?? [];
  // Q-66 (8): the cleaned copy is made on the server (a file of 50,000 rows) and opened from its signed link
  const download = trpc.dataImports.gridDownload.useMutation({ onSuccess: result => { const link = document.createElement("a"); link.href = result.url; link.download = result.fileName; link.rel = "noopener"; document.body.appendChild(link); link.click(); link.remove(); } });
  const headerOptions = [{ value: NOT_READ, label: t.notRead }, ...columns.headers.map(header => ({ value: header, label: header }))];

  const commit = () => {
    if (!editing) return;
    const original = rows.find(row => row.row === editing.row)?.cells[editing.field];
    setDrafts(previous => {
      const out = { ...previous };
      if (original && editing.value.trim() === original.value) delete out[cellKey(editing.row, editing.field)];
      else out[cellKey(editing.row, editing.field)] = editing.value;
      return out;
    });
    setOffer(original && original.value !== "" && editing.value.trim() !== "" && editing.value.trim() !== original.value ? { field: editing.field, from: original.value, to: editing.value.trim() } : null);
    setEditing(null);
  };

  const noteOf = (row: GridRow, field: string) => {
    const cell = row.cells[field];
    const draft = drafts[cellKey(row.row, field)];
    const reasons = (cell?.errors ?? []).map(error => pmcImportReason(error, language)); // the column is said already (the header, or «field:» in the detail)
    const change = draft !== undefined ? `${t.why.edited} · ${t.inFile}: «${cell?.value || t.empty}»` : cell?.why ? `${t.why[cell.why]} · ${t.inFile}: «${cell.from || t.empty}»` : "";
    return [change, ...reasons].filter(Boolean).join(" · ");
  };
  const cellView = (row: GridRow, field: string) => {
    const cell = row.cells[field];
    const draft = drafts[cellKey(row.row, field)];
    if (editing && editing.row === row.row && editing.field === field) {
      return <Input autoFocus aria-label={t.editLabel(label(field), row.row)} className="h-8 min-h-0 px-1 text-sm" maxLength={500} value={editing.value} onChange={event => setEditing({ ...editing, value: event.target.value })} onBlur={commit} onKeyDown={event => { if (event.key === "Enter") commit(); if (event.key === "Escape") setEditing(null); }} />;
    }
    const value = draft ?? cell?.value ?? "";
    const note = noteOf(row, field);
    return <span className="block truncate" title={note || undefined}>
      <bdi dir={NUMERIC.test(value) ? "ltr" : undefined}>{value}</bdi>
      {note && <span className="sr-only"> — {note}</span>}
    </span>;
  };
  const stateOf = (row: GridRow, field: string) => (drafts[cellKey(row.row, field)] !== undefined || row.cells[field]?.why ? "corrected" : row.cells[field]?.errors?.length ? "error" : "ok");
  const tone: Record<string, string> = { corrected: "bg-warning-soft text-warning-soft-foreground", error: "bg-danger-soft text-danger-soft-foreground ring-1 ring-inset ring-danger", ok: "" };

  if (first.error) return <p role="alert" className="text-sm text-danger-soft-foreground" data-testid="import-grid">{t.failed}: {getLocalizedProjectError(first.error, language)}</p>;
  const counts = first.data?.counts;
  return (
    <section className="space-y-2 rounded-xl border border-border p-3 text-sm" aria-label={t.title} data-testid="import-grid">
      <div>
        <h4 className="font-semibold">{t.title}</h4>
        <p className="text-xs text-muted-foreground">{t.hint}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label={t.title} className="flex flex-wrap gap-1">
          {TABS.map(name => (
            <button key={name} type="button" role="tab" aria-selected={tab === name} data-tab={name} className={`min-h-[44px] rounded-full border px-3 text-sm ${tab === name ? "border-primary bg-primary text-primary-foreground" : "border-border"}`} onClick={() => { setTab(name); scroller.current?.scrollTo?.({ top: 0 }); setScrollTop(0); }}>
              {t.tabs[name]} <bdi className="tabular-nums">{counts?.[name] ?? "…"}</bdi>
            </button>
          ))}
        </div>
        <label className="relative block sm:w-64">
          <span className="sr-only">{t.search}</span>
          <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground [inset-inline-start:0.75rem]" aria-hidden />
          <Input className="min-h-[44px] ps-9" placeholder={t.search} value={search} onChange={event => setSearch(event.target.value)} />
        </label>
      </div>
      {(first.data?.ignoredColumns ?? []).length > 0 && <p className="text-xs text-muted-foreground" data-unused-columns>{t.unused}: {first.data!.ignoredColumns.map((header, index) => <React.Fragment key={header}>{index ? "، " : ""}<bdi className="text-foreground/60 line-through">{header}</bdi></React.Fragment>)}</p>}
      <div ref={scroller} className="relative max-h-[60vh] overflow-auto rounded-lg border border-border" style={{ height: rows.length ? Math.min(rows.length + 2, VIEWPORT_ROWS) * GRID_ROW_HEIGHT : undefined }} onScroll={event => setScrollTop(event.currentTarget.scrollTop)} data-grid-scroller>
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm" aria-rowcount={total + 1}>
          <thead className="sticky top-0 z-20 bg-card">
            <tr>
              <th scope="col" className="sticky z-30 w-16 border-b border-e border-border bg-muted px-2 text-start [inset-inline-start:0]">{t.row}</th>
              {fields.map(field => (
                <th key={field.key} scope="col" className="min-w-[10rem] border-b border-e border-border bg-card px-2 py-1 text-start align-top font-normal" data-field={field.key}>
                  <span className="block font-semibold">{label(field.key)}</span>
                  <Select className="mt-1 w-full min-h-9 text-xs md:min-h-9" aria-label={t.source(label(field.key))} value={choice[field.key] ?? NOT_READ} options={headerOptions} onValueChange={value => setChoice(previous => ({ ...previous, [field.key]: value }))} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {start > 0 && <tr aria-hidden style={{ height: start * GRID_ROW_HEIGHT }}><td colSpan={fields.length + 1} /></tr>}
            {rows.slice(start, end).map((row, offset) => {
              const ignored = row.status === "ignored";
              const why = row.class === "total" ? t.ignoredTotal : t.ignoredLeftOut;
              const rowReasons = row.rowErrors.map(error => pmcImportReason(error, language));
              return (
                <tr key={`${row.index}:${row.row}`} aria-rowindex={start + offset + 2} data-row={row.row} data-status={row.status} style={{ height: GRID_ROW_HEIGHT }} className={ignored ? "bg-muted text-muted-foreground" : ""}>
                  <th scope="row" onClick={() => setFocused(row.row)} className={`sticky z-10 border-b border-e border-border px-2 text-start font-medium tabular-nums [inset-inline-start:0] ${row.status === "error" ? "bg-danger-soft text-danger-soft-foreground" : "bg-muted"}`} title={ignored ? why : rowReasons.join(" · ") || undefined}>
                    <bdi>{row.row}</bdi>{(ignored || rowReasons.length > 0) && <span className="sr-only"> — {ignored ? why : rowReasons.join(" · ")}</span>}
                  </th>
                  {fields.map(field => {
                    const state = ignored ? "ignored" : stateOf(row, field.key);
                    return (
                      <td key={field.key} data-cell={field.key} data-state={state} tabIndex={ignored ? undefined : 0}
                        className={`max-w-[18rem] border-b border-e border-border px-2 ${ignored ? "line-through" : tone[state]} ${NUMERIC.test(drafts[cellKey(row.row, field.key)] ?? row.cells[field.key]?.value ?? "") ? "text-end [direction:ltr]" : ""}`}
                        onClick={() => setFocused(row.row)} onFocus={() => setFocused(row.row)}
                        onDoubleClick={() => { if (!ignored) setEditing({ row: row.row, field: field.key, value: drafts[cellKey(row.row, field.key)] ?? row.cells[field.key]?.value ?? "" }); }}
                        onKeyDown={event => { if (!ignored && event.key === "Enter" && !editing) setEditing({ row: row.row, field: field.key, value: drafts[cellKey(row.row, field.key)] ?? row.cells[field.key]?.value ?? "" }); }}>
                        {cellView(row, field.key)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {end < rows.length && <tr aria-hidden style={{ height: (rows.length - end) * GRID_ROW_HEIGHT }}><td colSpan={fields.length + 1} /></tr>}
          </tbody>
        </table>
        {first.isLoading || loadingMore ? <p className="p-3 text-muted-foreground">{t.loading}</p> : rows.length === 0 && <p className="p-3 text-muted-foreground">{t.noRows}</p>}
      </div>
      {(() => {
        // Q-66 batch 1 (7): a file of several sheets shows them as tabs under the grid, like Excel; the sheet read is marked, and each tab says why it was
        // or was not read. Showing only: the grid stays the sheet the importer read.
        const sheets = first.data?.sheets ?? [];
        if (sheets.length < 2) return null;
        const shown = sheets.find(sheet => sheet.name === sheetShown) ?? sheets.find(sheet => sheet.read) ?? sheets[0];
        return <div className="space-y-1" data-grid-sheets>
          <div className="flex gap-1 overflow-x-auto border-t border-border" role="group" aria-label={t.sheets}>
            {sheets.map(sheet => (
              <button key={sheet.name} type="button" aria-pressed={sheet.name === shown.name} data-sheet={sheet.name} data-sheet-read={sheet.read ? "yes" : "no"} onClick={() => setSheetShown(sheet.name)}
                className={`min-h-[44px] shrink-0 rounded-b-md border border-t-0 px-3 text-sm ${sheet.name === shown.name ? "border-primary bg-card font-semibold" : "border-border bg-muted text-muted-foreground"} ${sheet.why === "hidden" ? "italic" : ""}`}>
                <bdi>{sheet.name}</bdi>{sheet.read && <span className="ms-1 rounded-full bg-success-soft px-1.5 text-xs text-success-soft-foreground">{t.sheetRead}</span>}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite" data-sheet-why={shown.why}><bdi>{t.sheetWhy[shown.why](shown.name, shown.headerRow, shown.missing?.length ? t.list(shown.missing.map(label)) : undefined)}</bdi></p>
        </div>;
      })()}
      {first.data && <p className="text-xs text-muted-foreground" data-grid-shown>{t.shown(rows.length, total)}</p>}
      {(() => {
        const row = focused === null ? undefined : rows.find(item => item.row === focused);
        if (!row) return null;
        const lines = row.status === "ignored" ? [row.class === "total" ? t.ignoredTotal : t.ignoredLeftOut]
          : [...row.rowErrors.map(error => pmcImportReason(error, language)), ...fields.map(field => { const note = noteOf(row, field.key); return note ? `${label(field.key)}: ${note}` : ""; }).filter(Boolean)];
        return <div className="rounded-lg border border-border bg-muted/40 p-2 text-xs" aria-live="polite" data-grid-detail={row.row}>
          <p className="font-medium">{t.row} <bdi>{row.row}</bdi> · {t.tabs[row.status === "error" ? "errors" : row.status === "ignored" ? "ignored" : row.status === "corrected" ? "corrected" : "ready"]}</p>
          {lines.length > 0 && <ul className="ms-4 list-disc">{lines.map((line, index) => <li key={index}><bdi>{line}</bdi></li>)}</ul>}
        </div>;
      })()}
      {remapped && <div className="flex flex-col gap-2 rounded-lg border border-border p-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">{t.remapNote}</p>
        <Button type="button" className="min-h-[44px]" disabled={reanalyze.isPending} onClick={() => reanalyze.mutate({ tenantId, projectId, importId, mappingOverride: mappingOf(choice) })}>{t.remap}</Button>
      </div>}
      {offer && <div className="flex flex-col gap-2 rounded-lg border border-border p-2 sm:flex-row sm:items-center sm:justify-between" data-grid-offer>
        <p className="text-sm"><bdi>{t.offer(offer.to, offer.from, label(offer.field))}</bdi></p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setOffer(null)}>{t.notNow}</Button>
          <Button type="button" className="min-h-[44px]" onClick={takeOffer}>{t.applyAll}</Button>
        </div>
      </div>}
      {(replaced.length > 0 || rules.length > 0) && <div className="space-y-1 rounded-lg border border-border p-2" data-grid-rules>
        <p className="text-xs font-medium">{t.rules}</p>
        <ul className="space-y-1">
          {replaced.map(rule => { const gone = dropped.has(ruleKey(rule)); return (
            <li key={`a:${ruleKey(rule)}`} className={`flex flex-wrap items-center justify-between gap-2 text-sm ${gone ? "opacity-50" : ""}`} data-rule="applied">
              <span><bdi>{t.rule(rule.from, rule.to, label(rule.field))}</bdi> · <span className="text-muted-foreground">{gone ? t.undone : t.cells(rule.cells)}</span></span>
              <Button type="button" variant="outline" className="min-h-[44px]" aria-pressed={gone} onClick={() => setDropped(previous => { const out = new Set(previous); if (out.has(ruleKey(rule))) out.delete(ruleKey(rule)); else out.add(ruleKey(rule)); return out; })}>{t.undo}</Button>
            </li>); })}
          {rules.map(rule => (
            <li key={`n:${ruleKey(rule)}`} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-rule="new">
              <bdi>{t.rule(rule.from, rule.to, label(rule.field))}</bdi>
              <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setRules(previous => previous.filter(item => ruleKey(item) !== ruleKey(rule)))}>{t.undo}</Button>
            </li>))}
        </ul>
      </div>}
      {pending > 0 && <div className="flex flex-col gap-2 rounded-lg border border-warning bg-warning-soft p-2 sm:flex-row sm:items-center sm:justify-between" data-grid-drafts>
        <p className="font-medium text-warning-soft-foreground">{t.edits(pending)}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => { setDrafts({}); setRules([]); setDropped(new Set()); }}>{t.discard}</Button>
          <Button type="button" className="min-h-[44px]" disabled={correct.isPending} onClick={() => correct.mutate({ tenantId, projectId, importId, edits: correctionsOf(applied, new Set(), drafts, new Set(ignoredRows), new Set(readRows), ruleSet()) })}>{t.apply}</Button>
        </div>
      </div>}
      {first.data && rows.length > 0 && <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between" data-grid-download>
        <p className="text-xs text-muted-foreground">{t.downloadHint}</p>
        <Button type="button" variant="outline" className="min-h-[44px]" disabled={download.isPending} onClick={() => download.mutate({ tenantId, projectId, importId, language })}><Download className="me-2 h-4 w-4" aria-hidden />{download.isPending ? t.downloading : t.download}</Button>
      </div>}
      {(correct.error || reanalyze.error || download.error) && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError((correct.error ?? reanalyze.error ?? download.error)!, language)}</p>}
      {counts && <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2" data-grid-summary>
        <span className="rounded-full bg-success-soft px-2 py-0.5 text-success-soft-foreground">{t.ready(counts.ready)}</span>
        <span className={`rounded-full px-2 py-0.5 ${counts.errors ? "bg-danger-soft text-danger-soft-foreground" : "bg-muted"}`}>{t.rejected(counts.errors)}</span>
        {checks.length > 0 && <span className="text-xs text-muted-foreground">{t.checks}:</span>}
        {checks.map(check => (
          <span key={check.label} className="inline-flex items-center gap-1 text-xs" data-check={check.ok ? "ok" : "fails"}>
            {check.ok ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> : <XCircle className="h-4 w-4 text-danger" aria-hidden />}
            <bdi>{check.label}</bdi>{check.detail && <bdi className="text-muted-foreground">({check.detail})</bdi>}
            <span className="sr-only">{check.ok ? "✅" : "❌"}</span>
          </span>
        ))}
      </div>}
    </section>
  );
}
