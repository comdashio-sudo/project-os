import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

type Totals = { projects: number; overdueActivities: number; criticalActivities: number | null; openHighRisks: number; criticalIssues: number; overdueActions: number };
type Data = {
  activitySignals: { projectId: string; overdueActivities: number; criticalActivities: number | null }[];
  programTotals: ({ programId: string } & Totals)[];
  portfolioTotals: ({ portfolioId: string } & Totals)[];
  programs: { id: string; code: string; name: string }[];
  portfolios: { id: string; code: string; name: string }[];
  projects: { id: string; code: string; name: string }[];
};

/**
 * Q-45 (b, adviser 18-11): overdue and critical activities per project, and every signal added up per program and portfolio. Each number comes from the server
 * (server/db.ts getPmoDashboard); «critical» is P6's total float ≤ 0, and where no activity of a project carries a float the cell says «غير متاح», never 0.
 */
export function PmoRollups({ data }: { data: Data }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, {
    ar: { title: "الأنشطة والمجاميع", sub: "المتأخرة: موعدها المخطط مضى ولم تكتمل. الحرجة: الفسحة الكلية ≤ 0 كما حسبها P6.", project: "المشروع", overdue: "أنشطة متأخرة", critical: "أنشطة حرجة", na: "غير متاح", byProgram: "حسب البرنامج", byPortfolio: "حسب المحفظة", name: "الاسم", projects: "المشاريع", risks: "مخاطر عالية", issues: "قضايا حرجة", actions: "إجراءات متأخرة", empty: "لا مشاريع في نطاقك.", naHint: "«غير متاح»: لا فسحة في أنشطته (جدول يدوي لا من P6)." },
    en: { title: "Activities and roll-ups", sub: "Overdue: planned finish passed and not complete. Critical: total float ≤ 0 as P6 computed it.", project: "Project", overdue: "Overdue activities", critical: "Critical activities", na: "Not available", byProgram: "By program", byPortfolio: "By portfolio", name: "Name", projects: "Projects", risks: "High risks", issues: "Critical issues", actions: "Overdue actions", empty: "No project in your scope.", naHint: "«Not available»: none of its activities carries a float (scheduled by hand, not from P6)." },
    ur: { title: "سرگرمیاں اور مجموعے", sub: "تاخیر: منصوبہ بند اختتام گزر گیا اور مکمل نہیں۔ نازک: کل گنجائش ≤ 0 جیسا P6 نے حساب کیا۔", project: "پروجیکٹ", overdue: "تاخیر والی سرگرمیاں", critical: "نازک سرگرمیاں", na: "دستیاب نہیں", byProgram: "پروگرام کے لحاظ سے", byPortfolio: "پورٹ فولیو کے لحاظ سے", name: "نام", projects: "پروجیکٹس", risks: "زیادہ خطرات", issues: "نازک مسائل", actions: "تاخیر والے اقدامات", empty: "آپ کے دائرے میں کوئی پروجیکٹ نہیں۔", naHint: "«دستیاب نہیں»: اس کی کسی سرگرمی میں گنجائش نہیں (P6 کے بجائے ہاتھ سے بنا شیڈول)۔" },
  });
  const critical = (value: number | null) => value === null ? <span className="text-muted-foreground">{t.na}</span> : value;
  const nameOf = (list: { id: string; code: string; name: string }[], id: string) => { const item = list.find(entry => entry.id === id); return item ? `${item.code} · ${item.name}` : id; };
  const cell = "px-3 py-2";
  const totalsTable = (title: string, rows: ({ id: string } & Totals)[], list: { id: string; code: string; name: string }[]) => rows.length ? (
    <div className="grid gap-2"><h3 className="text-sm font-semibold">{title}</h3>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={title}><table className="w-full min-w-[640px] text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
        <th className={`${cell} text-start`}>{t.name}</th><th className={cell}>{t.projects}</th><th className={cell}>{t.overdue}</th><th className={cell}>{t.critical}</th><th className={cell}>{t.risks}</th><th className={cell}>{t.issues}</th><th className={cell}>{t.actions}</th>
      </tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-border text-center">
        <td className={`${cell} text-start`}>{nameOf(list, row.id)}</td><td className={cell}>{row.projects}</td><td className={cell}>{row.overdueActivities}</td><td className={cell}>{critical(row.criticalActivities)}</td><td className={cell}>{row.openHighRisks}</td><td className={cell}>{row.criticalIssues}</td><td className={cell}>{row.overdueActions}</td>
      </tr>)}</tbody></table></div>
    </div>
  ) : null;
  return <section data-pmo-rollups aria-labelledby="pmo-rollups-title" className="mt-6 grid gap-4 rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-sm">
    <div><h2 id="pmo-rollups-title" className="text-lg font-semibold">{t.title}</h2><p className="mt-1 text-sm text-muted-foreground">{t.sub}</p></div>
    {data.activitySignals.length === 0 ? <p className="text-sm text-muted-foreground">{t.empty}</p> : (
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t.title}><table className="w-full min-w-[480px] text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className={`${cell} text-start`}>{t.project}</th><th className={cell}>{t.overdue}</th><th className={cell}>{t.critical}</th></tr></thead>
        <tbody>{data.activitySignals.map(row => <tr key={row.projectId} className="border-t border-border text-center"><td className={`${cell} text-start`}>{nameOf(data.projects, row.projectId)}</td><td className={cell}>{row.overdueActivities}</td><td className={cell}>{critical(row.criticalActivities)}</td></tr>)}</tbody></table></div>
    )}
    {data.activitySignals.some(row => row.criticalActivities === null) ? <p className="text-xs text-muted-foreground">{t.naHint}</p> : null}
    {totalsTable(t.byProgram, data.programTotals.map(row => ({ ...row, id: row.programId })), data.programs)}
    {totalsTable(t.byPortfolio, data.portfolioTotals.map(row => ({ ...row, id: row.portfolioId })), data.portfolios)}
  </section>;
}
