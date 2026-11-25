import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ds/Logo";
import { useLanguage } from "@/contexts/LanguageContext";
import { collectTables, tablesToSheets } from "@/lib/domTables";
import { buildWorkbookOfSheets, downloadWorkbook, exportFileName } from "@/lib/excelExport";
import { pickLanguage } from "@/lib/language";
import { FileSpreadsheet, Loader2, Printer } from "lucide-react";
import React, { useState } from "react";

// Q-57: the two buttons every framed page carries — «Export tables to Excel» and «Print / PDF» — and the print-only sheet header. They sit in the frame
// (ProductShell → AppShell), so a page needs nothing of its own for them; a page that has a table of its own with a richer export (ExportExcelButton) keeps it.

const WORDS = {
  excel: { ar: "تصدير الجداول (Excel)", en: "Export tables (Excel)", ur: "جدولیں برآمد کریں (Excel)" },
  working: { ar: "جارٍ إنشاء ملف Excel…", en: "Creating the Excel file…", ur: "Excel فائل بن رہی ہے…" },
  none: { ar: "لا جداول في هذه الصفحة لتصديرها.", en: "This page has no tables to export.", ur: "اس صفحے پر برآمد کرنے کے لیے کوئی جدول نہیں۔" },
  failed: { ar: "تعذّر إنشاء ملف Excel. حاول مرة أخرى.", en: "The Excel file could not be created. Try again.", ur: "Excel فائل نہیں بن سکی۔ دوبارہ کوشش کریں۔" },
  print: { ar: "طباعة / PDF", en: "Print / PDF", ur: "پرنٹ / PDF" },
  printedBy: { ar: "طبعها", en: "Printed by", ur: "پرنٹ کرنے والا" },
  company: { ar: "الشركة", en: "Company", ur: "کمپنی" },
  project: { ar: "المشروع", en: "Project", ur: "پروجیکٹ" },
  date: { ar: "التاريخ", en: "Date", ur: "تاریخ" },
};

export const PAGE_CONTENT_ATTRIBUTE = "data-page-content";

const pad = (value: number) => String(value).padStart(2, "0");
/** The day and the minute where the person is (never UTC), in Western digits. */
export const stampOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

type Context = { company?: string; project?: string; pageTitle: string; user?: string };

export function PageActions({ company, project, pageTitle }: Omit<Context, "user">) {
  const { language } = useLanguage();
  const [state, setState] = useState<"idle" | "busy" | "none" | "failed">("idle");
  const exportTables = async () => {
    const root = document.querySelector(`[${PAGE_CONTENT_ATTRIBUTE}]`);
    const tables = root ? collectTables(root) : [];
    if (tables.length === 0) { setState("none"); return; }
    setState("busy");
    try {
      const exportedAt = new Date();
      const bytes = await buildWorkbookOfSheets({ sheets: tablesToSheets(tables), meta: { title: pageTitle, company, project, exportedAt, locale: language } });
      downloadWorkbook(exportFileName(pageTitle || "page", exportedAt), bytes);
      setState("idle");
    } catch {
      setState("failed");
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-no-print data-page-actions>
      <Button type="button" variant="outline" size="sm" disabled={state === "busy"} aria-busy={state === "busy" || undefined} onClick={exportTables}>
        {state === "busy" ? <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet aria-hidden="true" className="me-2 h-4 w-4" />}
        {pickLanguage(language, WORDS.excel)}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
        <Printer aria-hidden="true" className="me-2 h-4 w-4" />{pickLanguage(language, WORDS.print)}
      </Button>
      {state === "busy" && <span role="status" className="text-xs text-muted-foreground">{pickLanguage(language, WORDS.working)}</span>}
      {state === "none" && <span role="status" className="text-xs text-muted-foreground">{pickLanguage(language, WORDS.none)}</span>}
      {state === "failed" && <span role="alert" className="text-xs text-danger-soft-foreground">{pickLanguage(language, WORDS.failed)}</span>}
    </div>
  );
}

/** Drawn on paper only: the logo, the page, the company and the project, the day and who printed it. The screen never shows it. */
export function PrintHeader({ company, project, pageTitle, user }: Context) {
  const { language } = useLanguage();
  const fact = (label: { ar: string; en: string; ur: string }, value?: string) => (value ? <span><b>{pickLanguage(language, label)}:</b> {value}</span> : null);
  return (
    <div className="hidden print:block" data-print-header>
      <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
        <Logo variant="horizontal" size={28} />
        <h1 className="text-base font-bold">{pageTitle}</h1>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-[11px] text-muted-foreground">
        {fact(WORDS.company, company)}{fact(WORDS.project, project)}{fact(WORDS.date, stampOf(new Date()))}{fact(WORDS.printedBy, user)}
      </p>
    </div>
  );
}
