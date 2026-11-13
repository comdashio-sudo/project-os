import { Button } from "@/components/ui/button";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { WriteGate } from "@/lib/permissions";
import { useLanguage } from "@/contexts/LanguageContext";
import { type ExportColumn } from "@/lib/excelExport";
import { formatMoney } from "@/lib/profitabilityView";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import React, { useState } from "react";
import { pickLanguage } from "@/lib/language";

const text = {
  ar: {
    title: "فواتير المشروع للعميل", number: "الرقم", date: "التاريخ", client: "العميل", total: "الإجمالي", status: "الحالة", paidOn: "تاريخ السداد", empty: "لا فواتير بعد.", loading: "جارٍ التحميل…", retry: "إعادة المحاولة",
    statuses: { draft: "مسودة", issued: "صادرة", paid: "مسدَّدة", void: "ملغاة" } as Record<string, string>, issue: "إصدار", pay: "تسجيل السداد", void: "إلغاء", payDate: "تاريخ السداد", confirm: "تأكيد",
    note: "المقبوضات في التدفق النقدي تُحسب من الفواتير المسدَّدة بتاريخ سدادها.",
  },
  en: {
    title: "Client invoices", number: "Number", date: "Date", client: "Client", total: "Total", status: "Status", paidOn: "Paid on", empty: "No invoices yet.", loading: "Loading…", retry: "Retry",
    statuses: { draft: "Draft", issued: "Issued", paid: "Paid", void: "Void" } as Record<string, string>, issue: "Issue", pay: "Record payment", void: "Void", payDate: "Payment date", confirm: "Confirm",
    note: "Receipts in the cash flow come from paid invoices, on the day they were paid.",
  }, ur: {
    title: "کلائنٹ کی انوائسز", number: "نمبر", date: "تاریخ", client: "کلائنٹ", total: "کل", status: "حیثیت", paidOn: "ادائیگی کی تاریخ", empty: "ابھی کوئی انوائس نہیں۔", loading: "لوڈ ہو رہا ہے…", retry: "دوبارہ کوشش کریں",
    statuses: { draft: "مسودہ", issued: "جاری شدہ", paid: "ادا شدہ", void: "منسوخ" } as Record<string, string>, issue: "جاری کریں", pay: "ادائیگی درج کریں", void: "منسوخ کریں", payDate: "ادائیگی کی تاریخ", confirm: "تصدیق کریں",
    note: "کیش فلو میں وصولیاں ادا شدہ انوائسز سے آتی ہیں، اسی دن جس دن ان کی ادائیگی ہوئی۔",
  },
};

export default function ProjectInvoicesPanel({ tenantId, projectId, currency }: { tenantId: string; projectId: string; currency: string }) {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  const list = trpc.projectInvoices.list.useQuery({ tenantId, projectId });
  const [paying, setPaying] = useState<string | null>(null);
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const move = trpc.projectInvoices.transitionStatus.useMutation({ onSuccess: () => { setPaying(null); list.refetch(); } });
  if (list.isLoading) return <p role="status" className="mt-6 text-sm text-slate-500">{t.loading}</p>;
  if (!list.data) return <div className="mt-6"><p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(list.error, isArabic)}</p><Button variant="outline" className="mt-2 min-h-[44px]" onClick={() => list.refetch()}>{t.retry}</Button></div>;
  const invoices = list.data;
  // Status is exported as the same text the cell shows, including the payment day of a paid invoice.
  const exportColumns: ExportColumn<(typeof invoices)[number]>[] = [
    { header: t.number, value: invoice => invoice.invoiceNumber, kind: "text" },
    { header: t.date, value: invoice => new Date(invoice.invoiceDate), kind: "date" },
    { header: t.client, value: invoice => invoice.clientName, kind: "text" },
    { header: t.total, value: invoice => Number(invoice.totalAmount), kind: "money" },
    { header: t.status, value: invoice => `${t.statuses[invoice.status]}${invoice.status === "paid" && invoice.paidAt ? ` · ${t.paidOn} ${new Date(invoice.paidAt).toISOString().slice(0, 10)}` : ""}`, kind: "text" },
  ];
  return (
    <section aria-label={t.title} className="mt-6" data-testid="invoices-panel">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{t.title}</h3><ExportExcelButton fileName="project-invoices" sheetName={t.title} title={t.title} rows={invoices} columns={exportColumns} /></div>
      {list.data.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t.empty}</p> : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead><tr className="text-xs text-slate-500"><th className="py-1 text-start">{t.number}</th><th className="text-start">{t.date}</th><th className="text-start">{t.client}</th><th className="text-start">{t.total}</th><th className="text-start">{t.status}</th><th /></tr></thead>
            <tbody>{list.data.map(invoice => (
              <tr key={invoice.id} className="border-t">
                <td className="py-1.5 pe-3">{invoice.invoiceNumber}</td><td className="whitespace-nowrap pe-3">{new Date(invoice.invoiceDate).toISOString().slice(0, 10)}</td><td className="pe-3">{invoice.clientName}</td>
                <td className="whitespace-nowrap pe-3">{formatMoney(Number(invoice.totalAmount), currency, isArabic)}</td>
                <td className="pe-3">{t.statuses[invoice.status]}{invoice.status === "paid" && invoice.paidAt ? ` · ${t.paidOn} ${new Date(invoice.paidAt).toISOString().slice(0, 10)}` : ""}</td>
                <td className="whitespace-nowrap">
<WriteGate permission={"project.invoice.match"} projectId={projectId}>
                  {invoice.status === "draft" && <Button size="sm" variant="outline" className="me-2 min-h-[44px]" disabled={move.isPending} onClick={() => move.mutate({ tenantId, projectId, invoiceId: invoice.id, nextStatus: "issued" })}>{t.issue}</Button>}
                  {invoice.status === "issued" && paying !== invoice.id && <Button size="sm" variant="outline" className="me-2 min-h-[44px]" onClick={() => setPaying(invoice.id)}>{t.pay}</Button>}
                  {invoice.status === "issued" && paying === invoice.id && (
                    <span className="me-2 inline-flex items-center gap-2"><input aria-label={t.payDate} type="date" className="min-h-[44px] rounded-lg border px-2" value={paidOn} onChange={event => setPaidOn(event.target.value)} /><Button size="sm" className="min-h-[44px]" disabled={move.isPending || !paidOn} onClick={() => move.mutate({ tenantId, projectId, invoiceId: invoice.id, nextStatus: "paid", paidAt: new Date(`${paidOn}T00:00:00.000Z`) })}>{t.confirm}</Button></span>
                  )}
                  {(invoice.status === "draft" || invoice.status === "issued") && <Button size="sm" variant="outline" className="min-h-[44px]" disabled={move.isPending} onClick={() => move.mutate({ tenantId, projectId, invoiceId: invoice.id, nextStatus: "void" })}>{t.void}</Button>}
                </WriteGate>
</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {move.error && <p role="alert" className="mt-2 text-sm text-red-700">{getLocalizedProjectError(move.error, isArabic)}</p>}
      <p className="mt-2 text-xs text-slate-500">{t.note}</p>
    </section>
  );
}
