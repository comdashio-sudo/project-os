import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { buildTableWorkbook, downloadWorkbook, exportFileName, type ExportColumn } from "@/lib/excelExport";
import { FileSpreadsheet } from "lucide-react";
import React, { useState } from "react";

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
};

/** Exports the table the screen shows, as an .xlsx file built in the browser. Nothing is sent to the server. */
export function ExportExcelButton<Row>({ fileName, sheetName, title, company, project, rows, columns }: Props<Row>) {
  const { isArabic } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const label = isArabic ? "تصدير إلى Excel" : "Export to Excel";
  const empty = isArabic ? "لا توجد صفوف لتصديرها" : "No rows to export";
  const error = isArabic ? "تعذّر إنشاء ملف Excel. حاول مرة أخرى." : "The Excel file could not be created. Try again.";

  const exportNow = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const exportedAt = new Date();
      const bytes = await buildTableWorkbook({ sheetName, columns, rows, meta: { title, company, project, exportedAt, locale: isArabic ? "ar" : "en" } });
      downloadWorkbook(exportFileName(fileName, exportedAt), bytes);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" disabled={busy || rows.length === 0} onClick={exportNow} aria-describedby={rows.length === 0 ? "export-empty" : undefined}>
        <FileSpreadsheet className="me-2 h-4 w-4" />
        {label}
      </Button>
      {rows.length === 0 && <span id="export-empty" className="text-xs text-muted-foreground">{empty}</span>}
      {failed && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
