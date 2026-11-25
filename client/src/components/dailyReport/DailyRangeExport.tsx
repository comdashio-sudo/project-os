import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { buildDailyRangeSheets, type RangeReport } from "@/lib/dailyRangeExport";
import { buildWorkbookOfSheets, downloadWorkbook, exportFileName } from "@/lib/excelExport";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import React, { useState } from "react";

// Q-57 (4): the daily reports between two dates as one workbook. It reads through siteReports.list (from, to) and siteReports.get — the same gates as the
// screen, section by section — and writes the file in the browser; no new export action on the server.

const WORDS = {
  title: { ar: "سجل التقارير اليومية لفترة (Excel)", en: "Daily reports for a period (Excel)", ur: "مدت کی روزانہ رپورٹیں (Excel)" },
  hint: { ar: "ورقة لكل: التقارير، العمالة، المعدات، الأعمال، المعوقات، الفحوصات، السلامة. يشمل ما تراه من أقسام فقط.", en: "One sheet each: reports, labour, equipment, works, obstacles, inspections, safety. Only the sections you may see.", ur: "ہر ایک کی الگ شیٹ: رپورٹیں، مزدور، سازوسامان، کام، رکاوٹیں، معائنے، حفاظت۔ صرف وہ حصے جو آپ دیکھ سکتے ہیں۔" },
  from: { ar: "من تاريخ", en: "From", ur: "از تاریخ" },
  to: { ar: "إلى تاريخ", en: "To", ur: "تا تاریخ" },
  action: { ar: "تصدير السجل", en: "Export the log", ur: "ریکارڈ برآمد کریں" },
  working: { ar: "جارٍ قراءة التقارير…", en: "Reading the reports…", ur: "رپورٹیں پڑھی جا رہی ہیں…" },
  bad: { ar: "اختر تاريخ بداية لا تتجاوز تاريخ النهاية.", en: "Pick a start date that is not after the end date.", ur: "آغاز کی تاریخ اختتام کی تاریخ کے بعد نہ ہو۔" },
  none: { ar: "لا تقارير في هذه الفترة.", en: "No reports in this period.", ur: "اس مدت میں کوئی رپورٹ نہیں۔" },
  cap: { ar: "الفترة تضم أكثر من 400 تقرير؛ ضيّقها حتى لا يُقطع السجل.", en: "The period holds more than 400 reports; narrow it so the log is not cut.", ur: "اس مدت میں 400 سے زیادہ رپورٹیں ہیں؛ اسے محدود کریں۔" },
  failed: { ar: "تعذّر إنشاء الملف. حاول مرة أخرى.", en: "The file could not be created. Try again.", ur: "فائل نہیں بن سکی۔ دوبارہ کوشش کریں۔" },
};
const CAP = 400;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function DailyRangeExport({ tenantId, projectId, company, project }: { tenantId: string; projectId: string; company?: string; project?: string }) {
  const { language } = useLanguage();
  const utils = trpc.useUtils();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const [to, setTo] = useState(today);
  const [state, setState] = useState<"idle" | "busy" | "bad" | "none" | "cap" | "failed">("idle");
  const t = (key: keyof typeof WORDS) => pickLanguage(language, WORDS[key]);
  const run = async () => {
    if (!from || !to || from > to) { setState("bad"); return; }
    setState("busy");
    try {
      const listed = await utils.siteReports.list.fetch({ tenantId, projectId, from, to });
      if (listed.length === 0) { setState("none"); return; }
      if (listed.length >= CAP) { setState("cap"); return; }
      // the reports are read one by one, a few at a time, each through the screen's own read (which drops the sections the reader may not see)
      const reads: RangeReport[] = [];
      for (let at = 0; at < listed.length; at += 6) reads.push(...(await Promise.all(listed.slice(at, at + 6).map(item => utils.siteReports.get.fetch({ tenantId, projectId, reportId: item.id })))) as unknown as RangeReport[]);
      const exportedAt = new Date();
      const built = buildDailyRangeSheets(reads, language);
      const bytes = await buildWorkbookOfSheets({ sheets: built.sheets, meta: { title: `${built.title} ${from} → ${to}`, company, project, exportedAt, locale: language } });
      downloadWorkbook(exportFileName(`daily-reports-${from}-${to}`, exportedAt), bytes);
      setState("idle");
    } catch {
      setState("failed");
    }
  };
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-border print:hidden" data-no-print data-daily-range-export>
      <h2 className="flex items-center gap-2 text-sm font-semibold"><FileSpreadsheet aria-hidden="true" className="h-4 w-4 text-primary" />{t("title")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("hint")}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div><Label htmlFor="range-from">{t("from")}</Label><Input id="range-from" type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></div>
        <div><Label htmlFor="range-to">{t("to")}</Label><Input id="range-to" type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></div>
        <Button type="button" variant="outline" disabled={state === "busy"} aria-busy={state === "busy" || undefined} onClick={run}>
          {state === "busy" ? <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet aria-hidden="true" className="me-2 h-4 w-4" />}{t("action")}
        </Button>
      </div>
      {state === "busy" && <p role="status" className="mt-2 text-xs text-muted-foreground">{t("working")}</p>}
      {(state === "bad" || state === "none" || state === "cap") && <p role="status" className="mt-2 text-xs text-muted-foreground">{t(state)}</p>}
      {state === "failed" && <p role="alert" className="mt-2 text-xs text-danger-soft-foreground">{t("failed")}</p>}
    </section>
  );
}
