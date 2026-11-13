import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { buildTableWorkbook, downloadWorkbook, exportFileName, type ExportColumn } from "@/lib/excelExport";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import React, { useId, useState } from "react";

type Props<Row> = {
  /** Name of the file, without the date; the export day is added. */
  fileName: string;
  /** Sheet name in the workbook. */
  sheetName: string;
  /** Title printed above the table. */
  title: string;
  company?: string;
  project?: string;
  /** The rows the screen shows right now, after its filters: the export matches the screen, not the whole data set. */
  rows: readonly Row[];
  /** The visible columns, in the order the screen shows them. */
  columns: readonly ExportColumn<Row>[];
  /** G-154: with no rows the button stays disabled; this says what to add, and where, for the table to have rows. */
  emptyHint?: { ar: string; en: string; ur: string };
};

/** Exports the table the screen shows, as an .xlsx file built in the browser. Nothing is sent to the server. */
export function ExportExcelButton<Row>({ fileName, sheetName, title, company, project, rows, columns, emptyHint }: Props<Row>) {
  const { language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const emptyId = `export-empty-${useId().replace(/:/g, "")}`;
  const label = pickLanguage(language, { ar: "تصدير إلى Excel", en: "Export to Excel", ur: "Excel میں برآمد کریں" });
  const empty = pickLanguage(language, { ar: "لا توجد صفوف لتصديرها", en: "No rows to export", ur: "برآمد کرنے کے لیے کوئی قطار نہیں" });
  const working = pickLanguage(language, { ar: "جارٍ إنشاء ملف Excel…", en: "Creating the Excel file…", ur: "Excel فائل بن رہی ہے…" });
  const error = pickLanguage(language, { ar: "تعذّر إنشاء ملف Excel. حاول مرة أخرى.", en: "The Excel file could not be created. Try again.", ur: "Excel فائل نہیں بن سکی۔ دوبارہ کوشش کریں۔" });

  const exportNow = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const exportedAt = new Date();
      const bytes = await buildTableWorkbook({ sheetName, columns, rows, meta: { title, company, project, exportedAt, locale: language } });
      downloadWorkbook(exportFileName(fileName, exportedAt), bytes);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" disabled={busy || rows.length === 0} aria-busy={busy || undefined} onClick={exportNow} aria-describedby={rows.length === 0 ? emptyId : undefined}>
        {busy ? <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet aria-hidden="true" className="me-2 h-4 w-4" />}
        {label}
      </Button>
      {busy && <span role="status" className="text-xs text-muted-foreground">{working}</span>}
      {rows.length === 0 && <span id={emptyId} data-export-empty className="max-w-xs text-xs text-muted-foreground">{empty}{emptyHint ? `. ${pickLanguage(language, emptyHint)}` : ""}</span>}
      {failed && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
