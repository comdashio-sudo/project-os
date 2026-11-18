import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { formatMoney } from "@/components/LevelDashboard";

type Totals = { projects: number; overdueActivities: number; criticalActivities: number | null; openHighRisks: number; criticalIssues: number; overdueActions: number };
type Data = {
  activitySignals: { projectId: string; overdueActivities: number; criticalActivities: number | null }[];
  commercialSignals?: { projectId: string; currency: string; openPurchaseOrders: number; openPurchaseOrderAmount: number | null; budget: number | null; actualCost: number | null }[];
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
    ar: { commercial: "الشراء والتكلفة", orders: "أوامر شراء مفتوحة", ordersValue: "قيمتها", budget: "الميزانية الحالية", actual: "التكلفة الفعلية المرحّلة", hidden: "مخفي", hiddenHint: "«مخفي»: المبالغ لمن يملك صلاحية مال المشروع وحده.", title: "الأنشطة والمجاميع", sub: "المتأخرة: موعدها المخطط مضى ولم تكتمل. الحرجة: الفسحة الكلية ≤ 0 كما حسبها P6.", project: "المشروع", overdue: "أنشطة متأخرة", critical: "أنشطة حرجة", na: "غير متاح", byProgram: "حسب البرنامج", byPortfolio: "حسب المحفظة", name: "الاسم", projects: "المشاريع", risks: "مخاطر عالية", issues: "قضايا حرجة", actions: "إجراءات متأخرة", empty: "لا مشاريع في نطاقك.", naHint: "«غير متاح»: لا فسحة في أنشطته (جدول يدوي لا من P6)." },
    en: { commercial: "Procurement and cost", orders: "Open purchase orders", ordersValue: "Their value", budget: "Current budget", actual: "Posted actual cost", hidden: "Hidden", hiddenHint: "«Hidden»: amounts only for whoever holds the project\u2019s money permission.", title: "Activities and roll-ups", sub: "Overdue: planned finish passed and not complete. Critical: total float ≤ 0 as P6 computed it.", project: "Project", overdue: "Overdue activities", critical: "Critical activities", na: "Not available", byProgram: "By program", byPortfolio: "By portfolio", name: "Name", projects: "Projects", risks: "High risks", issues: "Critical issues", actions: "Overdue actions", empty: "No project in your scope.", naHint: "«Not available»: none of its activities carries a float (scheduled by hand, not from P6)." },
    ur: { commercial: "خریداری اور لاگت", orders: "کھلے خریداری آرڈرز", ordersValue: "ان کی قیمت", budget: "موجودہ بجٹ", actual: "درج شدہ اصل لاگت", hidden: "پوشیدہ", hiddenHint: "«پوشیدہ»: رقم صرف اس کے لیے جس کے پاس پروجیکٹ کی مالی اجازت ہو۔", title: "سرگرمیاں اور مجموعے", sub: "تاخیر: منصوبہ بند اختتام گزر گیا اور مکمل نہیں۔ نازک: کل گنجائش ≤ 0 جیسا P6 نے حساب کیا۔", project: "پروجیکٹ", overdue: "تاخیر والی سرگرمیاں", critical: "نازک سرگرمیاں", na: "دستیاب نہیں", byProgram: "پروگرام کے لحاظ سے", byPortfolio: "پورٹ فولیو کے لحاظ سے", name: "نام", projects: "پروجیکٹس", risks: "زیادہ خطرات", issues: "نازک مسائل", actions: "تاخیر والے اقدامات", empty: "آپ کے دائرے میں کوئی پروجیکٹ نہیں۔", naHint: "«دستیاب نہیں»: اس کی کسی سرگرمی میں گنجائش نہیں (P6 کے بجائے ہاتھ سے بنا شیڈول)۔" },
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
    {data.commercialSignals && data.commercialSignals.length ? <div className="grid gap-2"><h3 className="text-sm font-semibold">{t.commercial}</h3>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t.commercial}><table className="w-full min-w-[640px] text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className={`${cell} text-start`}>{t.project}</th><th className={cell}>{t.orders}</th><th className={cell}>{t.ordersValue}</th><th className={cell}>{t.budget}</th><th className={cell}>{t.actual}</th></tr></thead>
        <tbody>{data.commercialSignals.map(row => { const money = (value: number | null) => value === null ? <span className="text-muted-foreground">{t.hidden}</span> : formatMoney(value, row.currency); return <tr key={row.projectId} className="border-t border-border text-center"><td className={`${cell} text-start`}>{nameOf(data.projects, row.projectId)}</td><td className={cell}>{row.openPurchaseOrders}</td><td className={cell}>{money(row.openPurchaseOrderAmount)}</td><td className={cell}>{money(row.budget)}</td><td className={cell}>{money(row.actualCost)}</td></tr>; })}</tbody></table></div>
      {data.commercialSignals.some(row => row.budget === null || row.openPurchaseOrderAmount === null) ? <p className="text-xs text-muted-foreground">{t.hiddenHint}</p> : null}
    </div> : null}
    {totalsTable(t.byProgram, data.programTotals.map(row => ({ ...row, id: row.programId })), data.programs)}
    {totalsTable(t.byPortfolio, data.portfolioTotals.map(row => ({ ...row, id: row.portfolioId })), data.portfolios)}
  </section>;
}
