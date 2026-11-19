import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import React from "react";
import { Select } from "@/components/ds/Select";

const NONE = "none";

// Q-17 (205-5, G-147): HR sets each employee's direct manager. A performance manager then sees the indicators of their direct reports
// (and no one else's) on the project screen «My indicators». Shown only to HR (employees.list needs project.hr.manage); others see nothing.
const text = {
  ar: { title: "خطوط التبعية المباشرة", hint: "اختر المدير المباشر لكل موظف. مدير الأداء في المشروع يرى مؤشرات من يتبعه مباشرة فقط.", manager: "المدير المباشر", none: "— بلا مدير —", empty: "لا يوجد موظفون نشطون بعد.", saved: "حُفظ" },
  en: { title: "Direct reporting lines", hint: "Choose each employee's direct manager. A project's performance manager sees the indicators of their direct reports only.", manager: "Direct manager", none: "— No manager —", empty: "No active employees yet.", saved: "Saved" },
  ur: { title: "براہِ راست رپورٹنگ لائنیں", hint: "ہر ملازم کا براہِ راست مینیجر منتخب کریں۔ منصوبے کا کارکردگی مینیجر صرف اپنے براہِ راست ماتحتوں کے اشاریے دیکھتا ہے۔", manager: "براہِ راست مینیجر", none: "— کوئی مینیجر نہیں —", empty: "ابھی کوئی فعال ملازم نہیں۔", saved: "محفوظ ہو گیا" },
};

export function ReportingLinesCard({ tenantId }: { tenantId: string }) {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  const list = trpc.employees.list.useQuery({ tenantId }, { retry: false });
  const setManager = trpc.employees.setManager.useMutation({ onSuccess: () => list.refetch() });
  if (list.error || !list.data) return null;
  const active = list.data.filter(row => row.employmentStatus === "active");
  return (
    <section aria-label={t.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-border">
      <h2 className="font-semibold">{t.title}</h2>
      <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{t.hint}</p>
      {setManager.error && <p role="alert" className="mt-3 text-sm text-destructive">{getLocalizedProjectError(setManager.error, isArabic)}</p>}
      {setManager.isSuccess && !setManager.error && <p role="status" className="mt-3 text-sm text-success-soft-foreground">{t.saved}</p>}
      {active.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t.empty}</p> : (
        <ul className="mt-3 divide-y">
          {active.map(row => (
            <li key={row.id} className="flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 break-words"><bdi dir="ltr">{row.employeeNumber}</bdi> · {row.fullName}</span>
              <Select className="w-full sm:w-64" aria-label={`${t.manager}: ${row.fullName}`} disabled={setManager.isPending} value={row.reportsToEmployeeId ?? NONE}
                onValueChange={value => setManager.mutate({ tenantId, employeeId: row.id, reportsToEmployeeId: value === NONE ? null : value })}
                options={[{ value: NONE, label: t.none }, ...active.filter(candidate => candidate.id !== row.id).map(candidate => ({ value: candidate.id, label: `${candidate.employeeNumber} · ${candidate.fullName}` }))]} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
