import { useLanguage } from "@/contexts/LanguageContext";
import { formatMoney } from "@/lib/profitabilityView";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import React from "react";
import { Button } from "@/components/ui/button";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import type { ExportColumn } from "@/lib/excelExport";
import { pickLanguage } from "@/lib/language";

const text = {
  ar: {
    title: "صافي التدفق النقدي شهريًا", month: "الشهر", receipts: "المقبوض", outflows: "المصروف", net: "الصافي", cumulative: "التراكمي", empty: "لا حركة نقدية مسجلة بعد: تظهر المقبوضات عند سداد الفواتير.", loading: "جارٍ التحميل…", retry: "إعادة المحاولة",
    lowest: (month: string, amount: string) => `أدنى رصيد تراكمي: ${amount} في ${month}.`,
    basis: "المقبوض = الفواتير المسدَّدة (شاملة الضريبة) بتاريخ السداد. المصروف = التكلفة الفعلية المرحّلة بتاريخ استحقاقها، وهي أقرب ما تسجله المنصة للمدفوعات لأن دفعات الموردين غير مسجلة.",
   monthlyTable: "جدول التدفق النقدي الشهري" },
  en: {
    title: "Net cash flow by month", month: "Month", receipts: "Received", outflows: "Paid out", net: "Net", cumulative: "Cumulative", empty: "No money movement recorded yet: receipts appear when invoices are paid.", loading: "Loading…", retry: "Retry",
    lowest: (month: string, amount: string) => `Lowest cumulative position: ${amount} in ${month}.`,
    basis: "Received = paid invoices (with VAT) on the day paid. Paid out = posted actual cost on the day it was incurred, the nearest the platform has to payments because payments to suppliers are not recorded.",
   monthlyTable: "Monthly cash-flow table" }, ur: {
    title: "ماہانہ خالص نقد بہاؤ", month: "مہینہ", receipts: "وصول شدہ", outflows: "ادا کی گئی رقم", net: "Net", cumulative: "جمع شدہ", empty: "ابھی تک رقم کی کوئی حرکت درج نہیں ہوئی: وصولیاں اس وقت ظاہر ہوں گی جب انوائسز ادا ہوں گی۔", loading: "لوڈ ہو رہا ہے…", retry: "دوبارہ کوشش کریں",
    lowest: (month: string, amount: string) => `Lowest cumulative position: ${amount} in ${month}.`,
    basis: "وصول شدہ = ادا شدہ انوائسز (VAT سمیت) اس دن جس دن ادا ہوئیں۔ ادا کی گئی رقم = درج شدہ اصل لاگت اس دن جس دن وہ ہوئی، کیونکہ سپلائرز کو ہونے والی ادائیگیاں درج نہیں ہوتیں اور یہ پلیٹ فارم کے پاس قریب ترین معلومات ہے۔",
   monthlyTable: "ماہانہ نقد بہاؤ کا جدول" },
};

export default function CashFlowMonthly({ tenantId, projectId, currency }: { tenantId: string; projectId: string; currency: string }) {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  const query = trpc.profitability.cashFlow.useQuery({ tenantId, projectId });
  const money = (value: number) => formatMoney(value, currency, isArabic);
  if (query.isLoading) return <p role="status" className="mt-6 text-sm text-slate-500">{t.loading}</p>;
  if (!query.data) return <div className="mt-6"><p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(query.error, isArabic)}</p><Button variant="outline" className="mt-2 min-h-[44px]" onClick={() => query.refetch()}>{t.retry}</Button></div>;
  const { months, lowestCumulative } = query.data;
  // The export uses the same headers and the same rows as the table below; the rows are the raw amounts, not the formatted text.
  const columns: ExportColumn<(typeof months)[number]>[] = [
    { header: t.month, value: row => row.month },
    { header: t.receipts, value: row => row.receipts, kind: "money" },
    { header: t.outflows, value: row => row.outflows, kind: "money" },
    { header: t.net, value: row => row.net, kind: "money" },
    { header: t.cumulative, value: row => row.cumulative, kind: "money" },
  ];
  return (
    <section aria-label={t.title} className="mt-6" data-testid="cashflow-monthly">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{t.title}</h3>
        <ExportExcelButton fileName="cash-flow-monthly" sheetName={t.title} title={t.title} rows={months} columns={columns} />
      </div>
      {months.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t.empty}</p> : (
        <>
          <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label={t.monthlyTable}>
            <table className="w-full min-w-[34rem] text-sm">
              <thead><tr className="text-xs text-slate-500"><th className="py-1 text-start">{t.month}</th><th className="text-start">{t.receipts}</th><th className="text-start">{t.outflows}</th><th className="text-start">{t.net}</th><th className="text-start">{t.cumulative}</th></tr></thead>
              <tbody>{months.map(row => (
                <tr key={row.month} className="border-t">
                  <td className="py-1.5 pe-3">{row.month}</td><td className="whitespace-nowrap pe-3">{money(row.receipts)}</td><td className="whitespace-nowrap pe-3">{money(row.outflows)}</td>
                  <td className={`whitespace-nowrap pe-3 ${row.net < 0 ? "text-red-700" : ""}`}>{money(row.net)}</td><td className={`whitespace-nowrap pe-3 font-semibold ${row.cumulative < 0 ? "text-red-700" : ""}`}>{money(row.cumulative)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {lowestCumulative && lowestCumulative.cumulative < 0 && <p role="status" className="mt-2 text-sm text-red-700">{t.lowest(lowestCumulative.month, money(lowestCumulative.cumulative))}</p>}
        </>
      )}
      <p className="mt-2 text-xs text-slate-500">{t.basis}</p>
    </section>
  );
}
