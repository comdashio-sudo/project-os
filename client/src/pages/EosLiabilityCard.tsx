import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import React from "react";
import { SourceNotice } from "@/components/SectionResilience";

// End-of-service liability by month (G-122). Shown only to a role that may read pay; it never calculates a legal
// end-of-service entitlement, and the card says so next to the figures.
const text = {
  ar: { title: "التزام نهاية الخدمة التراكمي", basis: "مجموع المخصصات الشهرية المسجّلة في مسيرات الرواتب المعتمدة أو المدفوعة فقط، وتُحسب افتراضيًا بمدة الخدمة (نصف شهر عن كل سنة من الخمس الأولى وشهر عن كل سنة بعدها، وللشركة تعديلها). تقدير للتكلفة، وليس احتسابًا قانونيًا.", month: "الشهر", accrued: "مخصص الشهر", cumulative: "الرصيد التراكمي", employees: "عدد الموظفين", byEmployee: "الرصيد حسب الموظف", total: "الإجمالي", empty: "لا مسيرات معتمدة بمخصصات بعد.", loading: "جارٍ التحميل…", mixed: "تنبيه: مسيرات بعملات مختلفة؛ الإجمالي لا يفصل بينها." },
  en: { title: "Cumulative end-of-service liability", basis: "The running sum of the monthly accruals booked in approved or paid payroll runs only. By default each month accrues by length of service (half a month a year for the first five years, a month a year after; the company can change it). A cost estimate, not a legal calculation.", month: "Month", accrued: "Accrued in month", cumulative: "Cumulative balance", employees: "Employees", byEmployee: "Balance by employee", total: "Total", empty: "No approved runs with accruals yet.", loading: "Loading…", mixed: "Note: runs in different currencies; the total does not separate them." },
};

export function EosLiabilityCard({ tenantId }: { tenantId: string }) {
  const { isArabic } = useLanguage();
  const t = isArabic ? text.ar : text.en;
  const capabilities = trpc.employees.payroll.capabilities.useQuery({ tenantId });
  const allowed = Boolean(capabilities.data?.canReadSensitivePayroll);
  const liability = trpc.employees.payroll.eosLiability.useQuery({ tenantId }, { enabled: allowed });
  if (capabilities.error) return <SourceNotice query={capabilities} isArabic={isArabic} title={isArabic ? "التزام نهاية الخدمة" : "End-of-service liability"} />;
  if (!allowed) return null;
  const money = (value: number) => new Intl.NumberFormat(isArabic ? "ar-SA" : "en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return (
    <section aria-label={t.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="font-semibold">{t.title}</h2>
      <p className="mt-1 max-w-3xl text-xs text-slate-500">{t.basis}</p>
      {liability.isLoading && <p role="status" className="mt-3 text-sm text-slate-500">{t.loading}</p>}
      {liability.error && <p role="alert" className="mt-3 text-sm text-red-700">{getLocalizedProjectError(liability.error, isArabic)}</p>}
      {liability.data && liability.data.months.length === 0 && <p className="mt-3 text-sm text-slate-500">{t.empty}</p>}
      {liability.data && liability.data.months.length > 0 && (
        <div className="mt-3 space-y-4">
          {liability.data.currencies.length > 1 && <p role="status" className="rounded-xl bg-amber-50 p-2 text-xs text-amber-900">{t.mixed}</p>}
          <table className="w-full text-sm">
            <thead><tr className="text-start text-xs text-slate-500"><th className="py-1 text-start">{t.month}</th><th className="text-end">{t.accrued}</th><th className="text-end">{t.cumulative}</th><th className="text-end">{t.employees}</th></tr></thead>
            <tbody>{liability.data.months.map(row => <tr key={row.month} className="border-t"><td className="py-1" dir="ltr">{row.month}</td><td className="text-end">{money(row.accrued)}</td><td className="text-end font-semibold">{money(row.cumulative)}</td><td className="text-end">{row.employees}</td></tr>)}</tbody>
            <tfoot><tr className="border-t font-semibold"><td className="py-1">{t.total}</td><td /><td className="text-end">{money(liability.data.total)}</td><td /></tr></tfoot>
          </table>
          <div>
            <h3 className="text-xs font-semibold text-slate-600">{t.byEmployee}</h3>
            <ul className="mt-1 divide-y text-sm">{liability.data.employees.map(row => <li key={row.employeeId} className="flex justify-between py-1"><span>{row.employeeNumber} · {row.fullName}</span><span>{money(row.cumulative)}</span></li>)}</ul>
          </div>
        </div>
      )}
    </section>
  );
}
